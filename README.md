# HITL Prompt Builder

교사가 프로젝트별 수업 주제를 설정하면 학생이 챗봇과 대화하며 최종 이미지 생성 프롬프트를 완성하는 Next.js 앱입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 현재 구현

- 교사 로그인: Supabase Auth 기반 이메일/비밀번호 로그인
- 프로젝트 관리: 프로젝트 생성, 수정, 삭제, 학생 기록 초기화
- 교사 설정: 수업 주제, 학습 목표, 산출물 유형, 필수 요소, 금지/주의 요소, AI 보조 토글
- 학생 채팅: `orient → explore → concrete → describe → draft → revise → final` 플로우
- 하이브리드 구조: 규칙 기반 엔진이 흐름을 통제하고, Gemini는 켜져 있을 때만 질문/프롬프트 문장을 보조
- AI 사용 제한: 학생당 AI 보조 15회 고정, 한도 초과 시 규칙 기반 결과로 fallback
- 안전 기능: 붙여넣기 차단, 욕설/성적 표현/폭언 차단, 무의미/주제 이탈 답변 재질문, 경고 3회 잠금
- 교사 모니터링: 학생별 단계, 수정 횟수, AI 사용 횟수, 경고 수, CSV 내보내기
- 저장소: Supabase `sessions`, `students` 테이블
- 로컬 상태: 브라우저 `localStorage`는 화면 상태와 캐시 용도로 사용

## Vercel 환경변수

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`GEMINI_API_KEY`가 없으면 AI 보조가 켜져 있어도 규칙 기반 결과로 fallback합니다.

기본 모델은 `gemini-2.0-flash`입니다. `GEMINI_MODEL=gemini-2.5-flash`처럼 2.5 이상을 쓰면 thinking 토큰을 줄이기 위해 `thinkingBudget: 0`을 자동 적용합니다.

현재 운영 기본값은 Gemini입니다. 저렴하게 운영하려면 Vercel 환경변수에 `GEMINI_MODEL=gemini-2.5-flash-lite`를 권장합니다.

## 배포 메모

- `.env.local`은 GitHub에 올리지 않습니다.
- Vercel Project Settings의 Environment Variables에 키를 넣습니다.
- Supabase 테이블은 `supabase/schema.sql`을 기준으로 준비합니다.
- 우리반 수업용으로는 학생 이름 대신 출석번호나 별칭 사용을 권장합니다.
- 학생 입장 링크와 접속 코드는 수업 시작 직전에 공유하고, 수업 후 필요 없는 학생 기록은 삭제합니다.

## 보안 범위

현재 앱은 초등학교 학급 단위 수업 파일럿을 목표로 합니다.

- 교사 프로젝트 삭제, 학생 삭제, 학생 전체 삭제 API는 교사 로그인 토큰을 확인합니다.
- 학생 저장 API는 학생 채팅 진행을 위해 service-role route handler를 사용하며, 공개 서비스 수준의 강한 인증/RLS 검증은 아직 아닙니다.
- AI 사용량은 학생별 15회로 제한하지만, IP별/전역 rate limit은 별도로 두지 않았습니다.
- 외부 공개 서비스로 확장할 경우 학생 저장 API 검증, 서버 측 잠금 해제 검증, rate limit, RLS 정책 강화를 우선 적용해야 합니다.
