# ai-chat

Claude와의 익명 스트리밍 대화 앱. 로그인 없이, 브라우저 세션당 하나의 대화 스레드를 유지하며 MongoDB에 영속화한다.

- **스택**: Next.js (App Router) + TypeScript + Tailwind CSS
- **LLM**: Anthropic Claude API (`@anthropic-ai/sdk`), 서버 사이드 라우트 핸들러에서만 호출
- **영속화**: MongoDB (Mongoose), 쿠키 기반 익명 세션 ID로 스코프

아키텍처와 개발 규칙은 [`CLAUDE.md`](./CLAUDE.md)를, 남은 작업은 [`TODO.md`](./TODO.md)를 참고.

## 시작하기

1. 의존성 설치

   ```bash
   npm install
   ```

2. 환경 변수 설정 — `.env.local.example`을 복사해 `.env.local`을 만들고 값을 채운다.

   ```bash
   cp .env.local.example .env.local
   ```

   | 변수                | 설명                                                        |
   | ------------------- | ----------------------------------------------------------- |
   | `ANTHROPIC_API_KEY` | Claude API 키. [console.anthropic.com](https://console.anthropic.com/settings/keys)에서 발급 |
   | `MONGODB_URI`       | MongoDB 연결 문자열 (예: MongoDB Atlas). 접속하는 IP가 Atlas Network Access 목록에 있어야 함 |

3. 개발 서버 실행

   ```bash
   npm run dev
   ```

   [http://localhost:3000](http://localhost:3000)에서 확인.

## 스크립트

| 명령어                            | 설명                                  |
| ---------------------------------- | ------------------------------------- |
| `npm run dev`                      | 개발 서버 실행 (Turbopack)             |
| `npm run build` / `npm start`      | 프로덕션 빌드 / 서빙                   |
| `npm run lint`                     | ESLint                                |
| `npx tsc --noEmit`                 | 타입체크                              |
| `npm test`                         | Vitest 전체 스위트 1회 실행            |
| `npx vitest run src/lib/x.test.ts` | 단일 테스트 파일 실행                  |
| `npx vitest`                       | watch 모드                            |

## 배포

GCP Cloud Run에 GitHub Actions로 배포한다 (`.github/workflows/deploy-ai-chat.yml`, `master`의 `ai-chat/**` 변경 시 자동 실행). 최초 1회만 `deploy/setup-gcp.sh`로 GCP 쪽(Artifact Registry, 서비스 계정, Workload Identity Federation, Secret Manager)을 준비해야 한다 — 자세한 내용은 `TODO.md` 9단계 참고.
