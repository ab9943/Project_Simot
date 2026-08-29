#!/usr/bin/env bash
# One-time GCP setup for deploying ai-chat to Cloud Run via GitHub Actions.
#
# Run this yourself (this script needs an interactive `gcloud auth login`,
# which nothing but you can do) — either:
#   a) locally, after installing the gcloud CLI
#        (Windows: winget install Google.CloudSDK, or
#         https://cloud.google.com/sdk/docs/install), from inside ai-chat/
#         so it can read ANTHROPIC_API_KEY/MONGODB_URI from .env.local, or
#   b) in Cloud Shell (console.cloud.google.com -> Activate Cloud Shell),
#        which is pre-authenticated — in that case export
#        ANTHROPIC_API_KEY and MONGODB_URI yourself before running this,
#        since .env.local won't be there.
#
# It is idempotent — safe to re-run.
set -euo pipefail

PROJECT_ID="ai-chat-507003"
REGION="asia-northeast3"
REPOSITORY="ai-chat"
SERVICE_ACCOUNT_ID="github-actions-deployer"
WIF_POOL="github-pool"
WIF_PROVIDER="github-provider"
GITHUB_REPO="ab9943/Project_Simot" # must match: owner/repo

# Pull ANTHROPIC_API_KEY / MONGODB_URI from ai-chat/.env.local if present and
# not already exported (Cloud Shell users: export these yourself first).
ENV_LOCAL="$(dirname "$0")/../.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a
fi
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY not set (not in .env.local and not exported)}"
: "${MONGODB_URI:?MONGODB_URI not set (not in .env.local and not exported)}"

# On Windows, Git Bash resolves the extensionless `gcloud` file (a POSIX
# script meant for a real Unix environment) before `gcloud.cmd`, which fails
# under MSYS. Prefer the .cmd wrapper when it's on PATH.
if command -v gcloud.cmd >/dev/null 2>&1; then
  GCLOUD="gcloud.cmd"
else
  GCLOUD="gcloud"
fi

echo "==> Setting active project to ${PROJECT_ID}"
"$GCLOUD" config set project "${PROJECT_ID}"

echo "==> Enabling required APIs"
"$GCLOUD" services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  secretmanager.googleapis.com

PROJECT_NUMBER="$("$GCLOUD" projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

echo "==> Creating Artifact Registry repo (Docker) if missing"
# No --description: on Windows, gcloud.cmd mangles flag values containing
# spaces when invoked from Git Bash — keep every flag value space-free.
"$GCLOUD" artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1 || \
  "$GCLOUD" artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}"

echo "==> Creating deploy service account if missing"
SA_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
"$GCLOUD" iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1 || \
  "$GCLOUD" iam service-accounts create "${SERVICE_ACCOUNT_ID}" \
    --display-name="github-actions-deployer"

echo "==> Granting roles to ${SA_EMAIL}"
# A freshly-created service account can take a few seconds to propagate
# through IAM before it can be granted roles — retry instead of failing.
for ROLE in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  for ATTEMPT in 1 2 3 4 5 6; do
    if "$GCLOUD" projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${ROLE}" \
      --condition=None >/dev/null 2>&1; then
      break
    fi
    if [[ "${ATTEMPT}" -eq 6 ]]; then
      echo "Failed to grant ${ROLE} to ${SA_EMAIL} after retries" >&2
      exit 1
    fi
    echo "  ...${ROLE} not ready yet, retrying in 10s (${ATTEMPT}/6)"
    sleep 10
  done
done

echo "==> Creating/updating secrets in Secret Manager"
for SECRET in ANTHROPIC_API_KEY MONGODB_URI; do
  if "$GCLOUD" secrets describe "${SECRET}" >/dev/null 2>&1; then
    printf '%s' "${!SECRET}" | "$GCLOUD" secrets versions add "${SECRET}" --data-file=-
  else
    printf '%s' "${!SECRET}" | "$GCLOUD" secrets create "${SECRET}" --data-file=-
  fi
done

# Cloud Run runs as the project's default compute service account unless
# --service-account is passed to deploy-cloudrun (kept simple here — override
# later if you want a dedicated, more-restricted runtime identity).
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "==> Granting the Cloud Run runtime identity (${RUNTIME_SA}) access to secrets"
for SECRET in ANTHROPIC_API_KEY MONGODB_URI; do
  "$GCLOUD" secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
done

echo "==> Setting up Workload Identity Federation for ${GITHUB_REPO}"
"$GCLOUD" iam workload-identity-pools describe "${WIF_POOL}" --location=global >/dev/null 2>&1 || \
  "$GCLOUD" iam workload-identity-pools create "${WIF_POOL}" \
    --location=global \
    --display-name="github-pool"

"$GCLOUD" iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
  --location=global --workload-identity-pool="${WIF_POOL}" >/dev/null 2>&1 || \
  "$GCLOUD" iam workload-identity-pools providers create-oidc "${WIF_PROVIDER}" \
    --location=global \
    --workload-identity-pool="${WIF_POOL}" \
    --display-name="github-provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"

"$GCLOUD" iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  >/dev/null

PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"

cat <<EOF

==> Done. One manual step left:

Set this as a GitHub Actions repository *variable* (not secret — it's not
sensitive) named GCP_WORKLOAD_IDENTITY_PROVIDER on ${GITHUB_REPO}:

  ${PROVIDER_RESOURCE}

Via the gh CLI:
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "${PROVIDER_RESOURCE}" --repo ${GITHUB_REPO}

Or in the GitHub UI: Settings -> Secrets and variables -> Actions -> Variables tab.
EOF
