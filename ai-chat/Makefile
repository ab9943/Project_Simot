# 참고: 이 프로젝트 저장소에는 make가 기본 설치되어 있지 않을 수 있습니다.
# 필요하면 `winget install GnuWin32.Make` 등으로 설치하세요.

PROJECT_ID := ai-chat-507003
REGION := asia-northeast3
REPOSITORY := ai-chat
SERVICE := ai-chat
IMAGE_BASE := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPOSITORY)/$(SERVICE)
GIT_SHA := $(shell git rev-parse --short HEAD)
IMAGE := $(IMAGE_BASE):manual-$(GIT_SHA)
# On Windows/Git Bash, the extensionless `gcloud` file resolves before
# `gcloud.cmd` and fails under MSYS — prefer the .cmd wrapper when present.
GCLOUD := $(shell command -v gcloud.cmd >/dev/null 2>&1 && echo gcloud.cmd || echo gcloud)

.PHONY: init dev build start lint typecheck test check \
	docker-build docker-run gcp-setup deploy

## 초기화 ---------------------------------------------------------------

init: ## 의존성 설치 + .env.local 생성 (없을 때만)
	npm install
	@if [ ! -f .env.local ]; then \
		cp .env.local.example .env.local; \
		echo "Created .env.local — fill in ANTHROPIC_API_KEY and MONGODB_URI"; \
	fi

## 개발 -----------------------------------------------------------------

dev: ## 개발 서버 실행 (Turbopack)
	npm run dev

lint: ## ESLint
	npm run lint

typecheck: ## 타입체크
	npx tsc --noEmit

test: ## Vitest 전체 스위트 1회 실행
	npm test

check: lint typecheck test ## lint + typecheck + test 한번에

## 빌드 -----------------------------------------------------------------

build: ## 프로덕션 빌드 (Next.js)
	npm run build

start: build ## 빌드 후 로컬에서 프로덕션 모드로 실행
	npm start

## 배포 (Cloud Run) -------------------------------------------------------
# 정상 배포 경로는 master에 푸시 -> .github/workflows/deploy-ai-chat.yml이 자동 배포.
# 아래 타깃들은 로컬에서 수동으로 빌드/배포할 때 사용 (gcloud, docker 필요).

gcp-setup: ## GCP 1회성 셋업 (Artifact Registry, 서비스 계정, WIF, Secret Manager)
	bash deploy/setup-gcp.sh

docker-build: ## Cloud Run용 Docker 이미지를 로컬에서 빌드
	docker build -t $(IMAGE) .

docker-run: docker-build ## 빌드한 이미지를 로컬에서 실행 (.env.local 사용)
	docker run --rm -p 8080:8080 --env-file .env.local -e PORT=8080 $(IMAGE)

deploy: docker-build ## 이미지를 Artifact Registry에 푸시하고 Cloud Run에 수동 배포
	$(GCLOUD) auth configure-docker $(REGION)-docker.pkg.dev --quiet
	docker push $(IMAGE)
	$(GCLOUD) run deploy $(SERVICE) \
		--project=$(PROJECT_ID) \
		--region=$(REGION) \
		--image=$(IMAGE) \
		--allow-unauthenticated \
		--min-instances=0 \
		--max-instances=3 \
		--set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,MONGODB_URI=MONGODB_URI:latest
