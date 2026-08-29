# TODO — ai-chat 구축 실행 계획

`CLAUDE.md`에 정의된 스펙(Next.js App Router + TypeScript + Tailwind, Claude API 스트리밍, MongoDB 영속화, 익명 세션 쿠키)을 기준으로 한 단계별 작업 목록.

## 1단계 — 프로젝트 초기화

- [x] `create-next-app`으로 Next.js (App Router, TypeScript, Tailwind, ESLint) 스캐폴딩
- [x] `tsconfig.json`에 `@/*` → `src/*` 경로 별칭 설정 확인
- [x] Vitest 설치 및 설정 (`vitest.config.ts`, `npm test` / `npx vitest` 스크립트 추가)
- [x] `.gitignore`에 `.env.local`, `node_modules` 등 확인
- [x] `.env.local` 생성 (커밋 금지) — `ANTHROPIC_API_KEY`, `MONGODB_URI` 항목 추가
- [x] `.env.local.example` 작성 (키 이름만, 값은 비움)

## 2단계 — 의존성 설치

- [x] `@anthropic-ai/sdk` 설치
- [x] `mongoose` 설치
- [x] 필요 시 `uuid` 또는 세션 ID 생성용 라이브러리 검토 (crypto.randomUUID로 대체 가능한지 우선 확인) — Node.js 내장 `crypto.randomUUID()`로 충분함을 확인, 별도 라이브러리 설치 불필요

## 3단계 — 데이터 계층

- [x] `src/lib/db.ts` — Mongoose 연결 싱글턴 작성 (핫 리로드 시 `global`에 연결 캐싱)
- [x] `src/models/Message.ts` — Mongoose 스키마 정의: `{ sessionId, role: "user" | "assistant", content, createdAt }`
- [x] `src/lib/session.ts` — 쿠키 기반 익명 세션 ID 읽기/생성 로직 작성
- [x] `src/lib/session.ts`에 대응하는 Vitest 테스트 작성

## 4단계 — Claude API 연동

- [x] `src/lib/claude.ts` — `@anthropic-ai/sdk` 래퍼: 메시지 요청 구성 + 응답 스트림 반환 (순수 로직과 스트리밍 로직 분리)
- [x] 메시지 포맷팅 등 테스트 가능한 순수 함수에 대한 Vitest 테스트 작성
- [x] API 키가 클라이언트에 노출되지 않는지 확인 (서버 전용 코드에서만 import)

## 5단계 — API 라우트

- [x] `src/app/api/chat/route.ts` — `POST` 핸들러 구현:
  - [x] 요청 바디 `{ sessionId, message }` 파싱
  - [x] 사용자 메시지 MongoDB 저장
  - [x] `src/lib/claude.ts` 호출하여 Claude 응답을 `ReadableStream`으로 클라이언트에 전달
  - [x] 스트림 완료 후 어시스턴트 전체 메시지 MongoDB 저장
  - [x] 에러 처리 (DB 저장 실패, Claude API 오류 등 경계 지점만 검증)

## 6단계 — 프론트엔드

- [x] `src/components/ChatApp.tsx` (`"use client"`) — UI 상태 관리, `/api/chat` 호출, 스트리밍 토큰 렌더링
- [x] `src/app/page.tsx` — `<ChatApp />` 렌더링 + 세션 ID 기준 이전 대화 이력 서버사이드 조회
- [x] Tailwind로 기본 채팅 UI 스타일링 (메시지 목록, 입력창, 전송 버튼, 로딩/스트리밍 상태 표시)
- [x] 새로고침 시 대화 유지 확인 (세션 쿠키 + MongoDB 이력 로드) — 확인 완료. 단, Claude API 호출이 스트림 시작 직후 실패하면 응답이 아예 끊겨 `Set-Cookie` 헤더가 브라우저에 전달되지 않는 버그를 발견하여 수정함 (`src/lib/claude.ts`의 `requireApiKey()`를 스트림 생성 전에 호출하도록 `route.ts` 변경, 테스트 추가)

## 7단계 — 품질 검증

- [x] `npx tsc --noEmit` 타입체크 통과
- [x] `npm run lint` 통과
- [x] `npm test` (Vitest 전체 스위트) 통과 — 17개 테스트 통과
- [x] 새 함수 추가 시 동일 커밋에 테스트 포함 여부 재확인 (`todo-next/CLAUDE.md`와 동일 규칙) — `session.ts`/`claude.ts`의 순수 함수는 테스트 포함, `db.ts`/`Message.ts`/`route.ts`는 IO 경계 코드로 판단해 테스트 제외

## 8단계 — 수동 QA (브라우저)

- [x] `npm run dev`로 로컬 구동 후 대화 흐름 테스트 (메시지 전송 → 스트리밍 응답 확인 — 실제 Anthropic API는 비용 발생을 피하기 위해 호출하지 않았고, 대신 `streamReply`를 임시로 가짜 스트림으로 바꿔 청크 단위 렌더링 → 완료 → DB 저장까지 파이프라인 전체를 검증한 뒤 원래 코드로 되돌림. `streamReply`의 실제 Anthropic 이벤트 파싱 로직은 SDK를 모킹한 Vitest 테스트로 별도 검증 완료)
- [x] 페이지 새로고침 후 이전 대화 유지되는지 확인
- [x] 세션 쿠키 삭제 후 새 세션으로 시작되는지 확인 (쿠키 미전송 요청으로 검증)
- [x] 네트워크 탭에서 `ANTHROPIC_API_KEY`가 클라이언트로 노출되지 않는지 확인 — 응답 바디에 미노출 확인 + `ANTHROPIC_API_KEY`는 서버 전용 파일(`claude.ts`)에서만 참조되고 클라이언트 컴포넌트에는 등장하지 않음을 grep으로 구조적으로 확인

참고: 실제 Anthropic API 키를 넣고 진짜 응답을 받아보는 것은 비용이 발생하므로 의도적으로 보류함. 위 방식으로 스트리밍 파이프라인(청크 렌더링, 세션 쿠키, DB 저장, 키 비노출)과 이벤트 파싱 로직은 모두 실비용 없이 검증됨. 실제 API 연동 자체(인증, 네트워크)는 키 준비 후 한 번 실제 메시지를 보내보는 것으로 마무리 가능.

## 9단계 — 배포

- [x] 배포 대상 플랫폼 결정 — **GCP Cloud Run + GitHub Actions** (GCP 프로젝트: `ai-chat-507003`, 리전: `asia-northeast3`). 이유: Next.js standalone 빌드가 컨테이너 하나로 스트리밍 API 라우트를 그대로 서빙할 수 있고, 트래픽 없을 땐 0으로 스케일됨
- [x] MongoDB — 기존 Atlas 인스턴스를 그대로 사용 (신규 프로덕션 인스턴스 불필요, `MONGODB_URI` 그대로 재사용). Atlas Network Access에 Cloud Run의 아웃바운드 IP가 고정되어 있지 않으므로 `0.0.0.0/0` 허용 필요 (또는 향후 Serverless VPC Connector + Private Service Connect로 전환 검토)
- [x] 배포용 코드/설정 준비 완료:
  - `next.config.ts`에 `output: "standalone"` 추가
  - `Dockerfile`, `.dockerignore` 추가 (멀티스테이지, Cloud Run이 주입하는 `PORT`를 사용)
  - `.github/workflows/deploy-ai-chat.yml` 추가 — `master`에서 `ai-chat/**` 변경 시 Artifact Registry로 이미지 빌드/푸시 후 Cloud Run 배포. `google-github-actions/auth`(Workload Identity Federation, 키 파일 없음)로 인증
  - `deploy/setup-gcp.sh` 추가 — GCP 쪽 1회성 셋업(API 활성화, Artifact Registry 저장소, 배포용 서비스 계정 + IAM, Secret Manager에 `ANTHROPIC_API_KEY`/`MONGODB_URI` 저장, Workload Identity Pool/Provider를 이 GitHub 저장소로 제한)을 자동화. `gcloud auth login`이 필요한 대화형 로그인이 껴 있어 에이전트가 대신 실행할 수 없음 — 사용자가 직접 실행해야 함
- [x] `deploy/setup-gcp.sh` 실행 (사용자가 직접: `winget install Google.CloudSDK` → `gcloud auth login` → 스크립트 실행). 진행 중 겪은 문제와 수정 사항:
  - Git Bash에서 확장자 없는 `gcloud` 파일이 `gcloud.cmd`보다 먼저 잡혀 실행이 깨짐 → 스크립트가 `gcloud.cmd`를 우선 사용하도록 수정 (`Makefile`도 동일하게 수정)
  - `--description`/`--display-name`에 공백이 들어간 값을 쓰면 이 Windows 환경의 `gcloud.cmd` 인용 처리에서 깨짐 → 공백 없는 값으로 전부 교체
  - 서비스 계정 생성 직후 바로 `add-iam-policy-binding`을 호출하면 IAM 전파 지연으로 "does not exist" 에러 발생 → 역할 부여 루프에 재시도(10초 간격, 최대 6회) 추가
  - 최종적으로 Artifact Registry 저장소, `github-actions-deployer` 서비스 계정 + IAM, Secret Manager의 `ANTHROPIC_API_KEY`/`MONGODB_URI`, Workload Identity Pool/Provider(이 저장소로 제한)까지 전부 정상 생성됨을 확인
- [x] `GCP_WORKLOAD_IDENTITY_PROVIDER` (`projects/511607687378/locations/global/workloadIdentityPools/github-pool/providers/github-provider`)를 `gh variable set`으로 GitHub 저장소(`ab9943/Project_Simot`) Actions 변수에 등록
- [x] MongoDB Atlas Network Access에 `0.0.0.0/0` 추가 (Cloud Run은 고정 아웃바운드 IP가 없어서 필요 — 사용자가 직접 Atlas 콘솔에서 추가)
- [x] `ai-chat/`을 처음으로 커밋 + `master` 푸시 (커밋 `7e0b612`) — 이번이 이 디렉터리의 첫 커밋이었음. 저장소 루트의 무관한 변경사항(`CLAUDE.md` 수정, `.serena/`, `todo-next/`)은 스테이징에서 제외
- [x] 푸시로 트리거된 GitHub Actions 워크플로(`33232698663`)가 1분 50초만에 전체 성공 (이미지 빌드 → Artifact Registry 푸시 → Cloud Run 배포)
- [x] 최초 배포 후 실제 헬스체크 — 배포된 URL(`https://ai-chat-cl2nse2tnq-du.a.run.app`)에서 브라우저로 메시지를 보내 Claude 응답(마크다운 렌더링 포함)과 MongoDB 연결까지 전부 정상 동작함을 확인

## 10단계 — 코드 리뷰로 발견된 구현 공백 (2026-08-29 실사용 QA 중 발견)

실제로 `.env.local`을 비운 채 메시지를 보내 API 키 오류를 재현하는 과정에서 발견된 버그 1건을 포함해, 소스 전체를 다시 읽고 확인한 공백 목록.

모두 구현 완료 (2026-08-29). 아래 각 항목에 실제 검증 방법을 남긴다.

### A. 안정성 / 에러 처리

- [x] **(버그, QA에서 실제 재현됨)** `ChatApp.tsx`의 `sendMessage` catch 블록에서, 전송 실패 시 optimistic하게 추가해둔 빈 assistant 말풍선이 제거되지 않고 그대로 남음 — `dropEmptyAssistantPlaceholder()`를 추가해 catch에서 호출하도록 수정. `ChatApp.test.tsx`의 "removes the empty assistant placeholder..." 테스트로 검증 (실패 후 `chat-message`가 사용자 말풍선 1개만 남는지 확인)
- [x] `route.ts`에서 스트리밍 도중 에러가 나면 그때까지의 `assistantText`(부분 응답)를 버리던 문제 — 에러가 나도 `assistantText`가 있으면 저장하도록 수정. 브라우저에서 긴 응답을 요청한 뒤 중단 버튼으로 실제 스트림을 끊고, 새로고침 후에도 끊긴 지점까지의 텍스트가 대화 이력에 남아있음을 직접 확인
- [x] 스트리밍 응답 중단 기능 없음 — `AbortController`를 `fetch`에 연결하고 스트리밍 중에는 전송 버튼이 "중단" 버튼으로 바뀌도록 구현. 브라우저에서 실제로 중단 버튼을 눌러 스트림이 즉시 멈추고 에러 문구 없이 정상 종료되는 것을 확인 (`ChatApp.test.tsx`의 abort 테스트로도 검증)
- [x] 전송 실패 시 재시도 수단 없음 — 실패한 메시지 텍스트를 `failedMessage`로 보관해두었다가 에러 문구 옆 "다시 시도" 버튼으로 재전송하도록 구현. `ChatApp.test.tsx`로 검증

### B. 입력 검증 / 비용·남용 방지

- [x] 메시지 길이 제한 없음 — `src/lib/chat-request.ts`에 `MAX_MESSAGE_LENGTH`(8000자) 상수를 두고 클라이언트 `<input maxLength>`, 서버 `validateChatRequest`, `Message` 스키마 `maxlength`가 모두 이 값을 공유하도록 구현. `chat-request.test.ts`, `ChatApp.test.tsx`로 검증
- [x] `/api/chat`에 rate limiting 없음 — `src/lib/rate-limit.ts`에 세션 ID 기준 고정 윈도우 제한(분당 10회)을 구현해 `route.ts`의 `POST`에 연동 (429 응답). 단일 프로세스 인메모리 구현이라 배포 플랫폼이 정해지면(9단계) 재검토 필요하다는 점을 코드 주석으로 남김. `rate-limit.test.ts`로 검증
- [x] 매 요청마다 전체 히스토리를 Claude에 통째로 전송하던 문제 — `claude.ts`에 `takeRecentHistory`(최근 20개로 truncate)를 추가해 `route.ts`에서 Claude로 보내기 직전에만 적용 (DB에는 여전히 전체 이력 저장). `claude.test.ts`로 검증

### C. UI/UX

- [x] **(실제 응답에서 확인됨)** 마크다운 미렌더링 — `react-markdown` + `@tailwindcss/typography`(`prose` 클래스) 도입, assistant 메시지에만 적용. 브라우저에서 굵게/목록/제목이 실제로 렌더링되는 것을 스크린샷으로 확인
- [x] 대화 초기화 UI 없음 — 헤더에 "새 대화 시작" 버튼 추가, `route.ts`에 `DELETE` 핸들러(쿠키의 세션 ID 기준으로 해당 세션 메시지 전체 삭제) 추가. 브라우저에서 클릭 후 새로고침까지 해서 MongoDB에서도 실제로 지워졌음을 확인

### D. 테스트 커버리지

- [x] 컴포넌트 테스트 부재 — `src/components/ChatApp.test.tsx` 추가 (초기 렌더, 전송/스트리밍, 실패 시 placeholder 제거+재시도, 중단, 새 대화 시작, 마크다운 렌더링, 길이 제한 총 7개 케이스). `vitest.config.ts`에 `environment: "jsdom"`, `setupFiles`(`@testing-library/jest-dom/vitest` + jsdom에 없는 `Element.scrollTo` 폴리필) 추가
- [x] `route.ts` 검증 로직 미테스트 — 검증 로직을 `src/lib/chat-request.ts`(순수 함수)로 분리하고 `route.ts`는 이를 호출만 하도록 변경, `chat-request.test.ts`로 커버

### E. 데이터 계층

- [x] `content` 길이 제한 없음 — B의 `MAX_MESSAGE_LENGTH`를 `Message` 스키마 `maxlength`로 공유 적용
- [x] `{ sessionId, createdAt }` 복합 인덱스 없음 — `messageSchema.index({ sessionId: 1, createdAt: 1 })` 추가 (기존 `sessionId` 단일 인덱스는 이 복합 인덱스로 대체)

### F. 문서화

- [x] `README.md`가 기본 템플릿 그대로 방치 — 프로젝트 설명, 환경 변수 표, 스크립트 표로 재작성

검증: `npx tsc --noEmit`, `npm run lint`, `npm test`(5개 테스트 파일, 44개 테스트) 모두 통과. `npm run build` 프로덕션 빌드도 성공 확인.

## 11단계 — 이미지 첨부(멀티모달) 지원 (GitHub Issue #2)

`ai-chat`은 텍스트 전용이었으나, Claude API의 이미지 입력(멀티모달)을 활용해 사용자가 채팅에 이미지를 첨부할 수 있도록 확장.

- [x] **저장 방식 결정**: MongoDB에 base64로 직접 저장 (오브젝트 스토리지 대신). 이유 — 메시지 한 건이 이미 컬렉션의 독립된 도큐먼트이므로(대화 전체가 아니라 메시지 하나가 16MB 제한의 단위), `chat-request.ts`의 크기 제한(이미지당 5MB, 메시지당 합계 10MB 디코딩 기준)만 지키면 MongoDB 16MB/document 한도에 여유 있게 들어옴. GCS 버킷 + 서비스 계정 권한 설정 같은 추가 인프라 작업 없이 기존 Atlas 인스턴스만으로 구현 가능. 이미지 볼륨이 커지면(다중 세션, 장기 보관 등) 버킷+URL 방식으로 마이그레이션을 재검토할 것.
- [x] **제한값 결정**: 허용 포맷 `image/jpeg`, `image/png`, `image/gif`, `image/webp` (Anthropic Messages API 지원 포맷), 메시지당 최대 4장, 이미지당 최대 5MB, 메시지당 합계 최대 10MB — `src/lib/chat-request.ts`의 `ALLOWED_IMAGE_MEDIA_TYPES` / `MAX_IMAGES_PER_MESSAGE` / `MAX_IMAGE_BYTES` / `MAX_TOTAL_IMAGE_BYTES`로 코드 전체(클라이언트 입력 제한, 서버 검증, `Message` 스키마)가 공유.
- [x] `src/lib/claude.ts` — `ChatMessage`에 `images?: ChatImage[]` 추가, `buildMessageRequest`가 이미지가 있으면 텍스트+이미지 콘텐츠 블록 배열로 변환하도록 확장 (`claude.test.ts`로 검증).
- [x] `src/lib/chat-request.ts` — `validateChatRequest`에 이미지 개수/포맷/base64 형식/용량(개별+합계) 검증 추가. 텍스트 없이 이미지만 있는 메시지도 허용하도록 "메시지 필수" 규칙을 "텍스트 또는 이미지 중 하나는 필수"로 변경 (`chat-request.test.ts`로 검증).
- [x] `src/models/Message.ts` — `images` 서브도큐먼트 배열 필드 추가 (허용 포맷 enum, 개수 상한 검증). 기존에 `required: true`였던 `content`를 이미지만 있는 메시지를 허용하도록 완화.
- [x] `src/app/api/chat/route.ts` — 사용자 메시지 저장/히스토리 조회 시 `images` 포함하여 Claude 컨텍스트로 전달.
- [x] `src/components/ChatApp.tsx` — 파일 선택 버튼, 드래그앤드롭, 붙여넣기로 이미지 첨부, 전송 전 썸네일 미리보기 및 개별 제거, 개수/용량 초과 시 에러 메시지, 대화 이력에 첨부 이미지 렌더링 (`ChatApp.test.tsx`로 검증).
- [x] `src/app/page.tsx` — 세션 히스토리 로드 시 `images` 포함하도록 매핑.
- [ ] **후속 검토 (범위 밖)**: 히스토리 truncation(`takeRecentHistory`)이 이미지 포함 메시지의 토큰/비용에 미치는 영향은 별도 이슈로 추적 필요 — 현재는 `MAX_HISTORY_MESSAGES`(20개) 안에 이미지가 여러 장 포함된 메시지가 여럿 있으면 요청 토큰 비용이 크게 늘 수 있음.

검증 방법: `npm ci`/`npm run lint`/`npx tsc --noEmit`/`npm test`를 CI 환경(GitHub Actions에서 트리거된 이 작업)에서 직접 실행할 셸 권한이 없어 로컬 실행으로 확인하지 못함 — PR CI 또는 로컬에서 실행 확인 필요.
