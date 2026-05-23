# HITL Prompt Builder

교사가 수업 주제를 설정하면 학생이 챗봇과 대화하며 최종 프롬프트를 완성하는 Next.js SPA형 MVP입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

## 현재 구현

- 교사 설정: 수업 주제, 학습 목표, 산출물 유형, 필수 요소, 금지/주의 요소, AI 보조 토글, 학생당 AI 호출 한도
- 학생 채팅: `orient → explore → concrete → describe → draft → revise → final` 플로우
- 하이브리드 구조: 규칙 기반 엔진이 흐름을 통제하고, Gemini는 켜져 있을 때만 질문/프롬프트 문장을 보조
- 안전 기능: 붙여넣기 차단, 부적절/무의미 입력 경고
- 교사 모니터링: 학생별 단계, 수정 횟수, AI 사용 횟수, 경고 수, CSV 내보내기
- MVP 저장소: 브라우저 `localStorage`
- Supabase 준비: `supabase/schema.sql`

## Vercel 환경변수

```text
GEMINI_API_KEY=
AI_PROVIDER=upstage
UPSTAGE_API_KEY=
UPSTAGE_MODEL=solar-mini
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`GEMINI_API_KEY`가 없으면 AI 보조가 켜져 있어도 규칙 기반 결과로 fallback합니다.

기본 모델은 `gemini-2.0-flash`입니다. `GEMINI_MODEL=gemini-2.5-flash`처럼 2.5 이상을 쓰면 thinking 토큰을 줄이기 위해 `thinkingBudget: 0`을 자동 적용합니다.

Upstage를 쓰려면 Vercel 환경변수에 `AI_PROVIDER=upstage`, `UPSTAGE_API_KEY`, `UPSTAGE_MODEL=solar-mini`를 추가합니다. `AI_PROVIDER`를 비워두면 Gemini를 사용합니다.

## 배포 메모

- `.env.local`은 GitHub에 올리지 않습니다.
- Vercel Project Settings의 Environment Variables에 키를 넣습니다.
- Supabase 연결은 다음 단계에서 `localStorage` 저장소를 DB 호출로 교체하면 됩니다.
