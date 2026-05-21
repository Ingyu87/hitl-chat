# Implementation Guide: 교사 주제 기반 하이브리드 HITL 프롬프트 빌더
**버전**: 2.1 | **작성일**: 2026-05-21

---

## 1. 기술 스택

| 영역 | 기술 | 선택 이유 |
|---|---|---|
| **프론트엔드** | Next.js 14 App Router | 학생/교사 화면을 한 프로젝트에서 관리 |
| **스타일링** | Tailwind CSS | 기존 HTML 시안의 디자인 토큰을 이전하기 쉬움 |
| **백엔드** | Next.js Route Handlers | 별도 서버 없이 API 통합 |
| **챗봇 플로우** | 규칙 기반 TypeScript 로직 | 단계, 저장, 승인, 안전 정책을 안정적으로 통제 |
| **AI 품질 보조** | Gemini API | 질문 문장과 프롬프트 품질 개선 |
| **데이터베이스** | Supabase PostgreSQL | 세션, 학생, 메시지, 프롬프트 관계 관리에 적합 |
| **실시간 통신** | Supabase Realtime | 교사 대시보드 진행 상태와 경고 업데이트 |
| **인증** | Supabase Auth + 학생 접속 코드 | 교사는 계정 로그인, 학생은 간단 입장 |
| **저장소** | Supabase Storage optional | 이후 산출물 이미지 업로드가 필요할 때 사용 |
| **배포** | Vercel | Next.js 배포에 적합 |
| **소스 관리** | GitHub | Vercel 자동 배포와 Pull Request 기반 검토에 적합 |

중요 원칙:
- 규칙 기반 엔진은 항상 먼저 실행된다.
- Gemini는 세션에서 AI 보조가 켜져 있고 학생별 호출 한도 안일 때만 실행된다.
- Gemini 실패, API 키 없음, 한도 초과 시 규칙 기반 결과로 즉시 fallback한다.
- OpenAI API와 Codex API는 현재 구현 범위에서 사용하지 않는다.

---

## 2. 프로젝트 구조

```text
hitl-chatbot/
├── app/
│   ├── student/
│   │   ├── login/page.tsx
│   │   └── chat/page.tsx
│   ├── teacher/
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── settings/page.tsx
│   │   └── students/page.tsx
│   └── api/
│       ├── chat/route.ts
│       ├── safety/route.ts
│       ├── monitor/route.ts
│       └── prompt/route.ts
├── components/
│   ├── ChatWindow.tsx
│   ├── ChatInput.tsx
│   ├── ProgressBar.tsx
│   ├── PromptDisplay.tsx
│   └── dashboard/
│       ├── StudentGrid.tsx
│       ├── AlertList.tsx
│       └── PromptManager.tsx
├── lib/
│   ├── flow.ts
│   ├── prompt-builder.ts
│   ├── ai-assist.ts
│   ├── gemini.ts
│   ├── safety.ts
│   └── supabase.ts
├── types/
│   └── index.ts
└── supabase/
    └── schema.sql
```

기존 `studentlogin.html`, `studentchat.html`, `teacherlogin.html`, `teachersetting.html`, `monitoring.html`은 UI 참고 자료로 유지한다.

---

## 3. 데이터베이스 스키마

```sql
-- supabase/schema.sql

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL DEFAULT '프롬프트 만들기 수업',
  topic TEXT NOT NULL,
  learning_goal TEXT NOT NULL,
  output_type TEXT NOT NULL DEFAULT '이미지 생성 프롬프트',
  required_elements TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  constraints TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  question_flow JSONB NOT NULL DEFAULT '[
    {"stage":"orient","label":"주제 이해"},
    {"stage":"explore","label":"아이디어 탐색"},
    {"stage":"concrete","label":"구체화"},
    {"stage":"describe","label":"조건 묘사"},
    {"stage":"draft","label":"프롬프트 초안"},
    {"stage":"revise","label":"수정"},
    {"stage":"final","label":"최종 승인"}
  ]'::jsonb,
  max_loop_count INT NOT NULL DEFAULT 3,
  ai_enabled BOOLEAN NOT NULL DEFAULT false,
  ai_provider TEXT NOT NULL DEFAULT 'gemini',
  ai_usage_policy TEXT NOT NULL DEFAULT 'questions_and_prompts',
  ai_calls_per_student_limit INT NOT NULL DEFAULT 8,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  access_code TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'orient',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, access_code)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('assistant', 'user', 'system')),
  content TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('orient', 'explore', 'concrete', 'describe', 'draft', 'revise', 'final')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  loop_count INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('rule', 'ai_assisted', 'student_revision')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE safety_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('profanity', 'paste_attempt', 'off_topic', 'meaningless')),
  attempted_content TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_assist_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  purpose TEXT NOT NULL CHECK (purpose IN ('question_polish', 'draft_prompt', 'revise_prompt')),
  stage TEXT NOT NULL CHECK (stage IN ('orient', 'explore', 'concrete', 'describe', 'draft', 'revise', 'final')),
  used BOOLEAN NOT NULL DEFAULT false,
  fallback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assist_logs ENABLE ROW LEVEL SECURITY;
```

RLS 원칙:
- 교사는 자신의 세션 전체 데이터에 접근한다.
- 학생은 자신의 세션과 자신의 메시지/프롬프트만 접근한다.
- 대시보드용 집계는 교사 권한 API에서 처리한다.

---

## 4. 핵심 타입

```typescript
export type Stage =
  | 'orient'
  | 'explore'
  | 'concrete'
  | 'describe'
  | 'draft'
  | 'revise'
  | 'final';

export type AiPurpose = 'question_polish' | 'draft_prompt' | 'revise_prompt';

export type SessionConfig = {
  id: string;
  title: string;
  topic: string;
  learningGoal: string;
  outputType: string;
  requiredElements: string[];
  constraints: string[];
  questionFlow: { stage: Stage; label: string; question?: string }[];
  maxLoopCount: number;
  aiEnabled: boolean;
  aiProvider: 'gemini';
  aiUsagePolicy: 'questions_and_prompts';
  aiCallsPerStudentLimit: number;
};

export type ChatMessage = {
  role: 'assistant' | 'user' | 'system';
  content: string;
  stage: Stage;
};

export type FlowResult = {
  nextStage: Stage;
  assistantMessage: string;
  draftPrompt?: string;
  shouldCreatePrompt: boolean;
  promptSource?: 'rule' | 'ai_assisted' | 'student_revision';
  aiPurpose?: AiPurpose;
  isFinal?: boolean;
};

export type AiAssistResult = {
  text: string;
  used: boolean;
  fallbackReason?: string;
};
```

---

## 5. 하이브리드 챗봇 엔진

### 5-1. `lib/flow.ts`

`flow.ts`는 단계 결정, 분기, 저장 조건, AI 보조 목적 판단만 담당한다. Gemini를 직접 호출하지 않는다.

```typescript
import type { ChatMessage, FlowResult, SessionConfig, Stage } from '@/types';
import { buildDraftPrompt, revisePrompt } from './prompt-builder';

const ORDER: Stage[] = ['orient', 'explore', 'concrete', 'describe', 'draft', 'revise', 'final'];

export function getInitialMessage(config: SessionConfig): FlowResult {
  return {
    nextStage: 'orient',
    assistantMessage: `오늘 주제는 "${config.topic}"이야. ${config.learningGoal} 먼저 이 주제를 네 말로 설명해볼래?`,
    shouldCreatePrompt: false,
    aiPurpose: 'question_polish',
  };
}

export function getNextFlow(args: {
  config: SessionConfig;
  history: ChatMessage[];
  studentInput: string;
  currentStage: Stage;
  latestPrompt?: string;
  loopCount: number;
}): FlowResult {
  const { config, history, studentInput, currentStage, latestPrompt, loopCount } = args;

  if (currentStage === 'draft') {
    const draftPrompt = buildDraftPrompt({ config, history });
    return {
      nextStage: 'revise',
      assistantMessage: `지금까지 네 답변으로 프롬프트 초안을 만들었어.\n\n${draftPrompt}\n\n더 넣고 싶은 내용이나 바꾸고 싶은 부분이 있을까?`,
      draftPrompt,
      shouldCreatePrompt: true,
      promptSource: 'rule',
      aiPurpose: 'draft_prompt',
    };
  }

  if (currentStage === 'revise') {
    if (isFinalApproval(studentInput)) {
      return {
        nextStage: 'final',
        assistantMessage: '좋아. 이 프롬프트를 최종본으로 저장할게.',
        shouldCreatePrompt: false,
        isFinal: true,
      };
    }

    if (latestPrompt && loopCount < config.maxLoopCount) {
      const draftPrompt = revisePrompt(latestPrompt, studentInput);
      return {
        nextStage: 'revise',
        assistantMessage: `수정 의견을 반영했어.\n\n${draftPrompt}\n\n이걸로 확정할까, 아니면 한 번 더 고칠까?`,
        draftPrompt,
        shouldCreatePrompt: true,
        promptSource: 'student_revision',
        aiPurpose: 'revise_prompt',
      };
    }

    return {
      nextStage: 'final',
      assistantMessage: '수정할 수 있는 횟수를 모두 사용했어. 지금 프롬프트를 최종본으로 저장할게.',
      shouldCreatePrompt: false,
      isFinal: true,
    };
  }

  const nextStage = nextOf(currentStage);
  return {
    nextStage,
    assistantMessage: buildQuestion(config, nextStage),
    shouldCreatePrompt: false,
    aiPurpose: ['explore', 'concrete', 'describe'].includes(nextStage) ? 'question_polish' : undefined,
  };
}

function nextOf(stage: Stage): Stage {
  return ORDER[Math.min(ORDER.indexOf(stage) + 1, ORDER.length - 1)];
}

function buildQuestion(config: SessionConfig, stage: Stage): string {
  const custom = config.questionFlow.find((item) => item.stage === stage)?.question;
  if (custom) return custom;

  const required = config.requiredElements.length ? ` 꼭 포함할 것은 ${config.requiredElements.join(', ')}이야.` : '';

  switch (stage) {
    case 'explore':
      return `"${config.topic}"에서 가장 표현하고 싶은 부분은 무엇이야?${required}`;
    case 'concrete':
      return '그 생각이 실제 장면이나 결과물로 나타난다면 어디에서 어떤 일이 일어날까?';
    case 'describe':
      return '색, 분위기, 사람, 물건, 배경 같은 조건은 어떻게 보이면 좋을까?';
    case 'draft':
      return '좋아. 지금까지 답변을 모아서 프롬프트 초안을 만들어볼게.';
    default:
      return `오늘 주제 "${config.topic}"에 대해 조금 더 말해줄래?`;
  }
}

function isFinalApproval(input: string): boolean {
  return /확정|좋아|이걸로|완성|최종|괜찮/.test(input);
}
```

### 5-2. `lib/prompt-builder.ts`

```typescript
import type { ChatMessage, SessionConfig } from '@/types';

export function buildDraftPrompt(args: {
  config: SessionConfig;
  history: ChatMessage[];
}): string {
  const answers = args.history
    .filter((message) => message.role === 'user')
    .map((message) => message.content.trim())
    .filter(Boolean);

  const required = args.config.requiredElements.length
    ? `반드시 포함할 요소: ${args.config.requiredElements.join(', ')}.`
    : '';

  const constraints = args.config.constraints.length
    ? `피해야 할 요소: ${args.config.constraints.join(', ')}.`
    : '';

  return [
    `${args.config.outputType}: ${args.config.topic}.`,
    `학습 목표: ${args.config.learningGoal}.`,
    required,
    `학생 아이디어: ${answers.join(' / ')}.`,
    constraints,
    '학생이 말한 내용을 중심으로 구체적이고 선명하게 표현한다.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function revisePrompt(previousPrompt: string, revisionRequest: string): string {
  return `${previousPrompt}\n수정 반영: ${revisionRequest}`;
}
```

### 5-3. `lib/ai-assist.ts`

```typescript
import type { AiAssistResult, AiPurpose, ChatMessage, SessionConfig, Stage } from '@/types';
import { callGemini } from './gemini';

export async function maybeAssistWithAi(args: {
  config: SessionConfig;
  studentId: string;
  sessionId: string;
  stage: Stage;
  purpose?: AiPurpose;
  baseText: string;
  history: ChatMessage[];
  aiCallCount: number;
}): Promise<AiAssistResult> {
  const { config, purpose, baseText, aiCallCount } = args;

  if (!purpose) return { text: baseText, used: false, fallbackReason: 'no_ai_purpose' };
  if (!config.aiEnabled) return { text: baseText, used: false, fallbackReason: 'ai_disabled' };
  if (!process.env.GEMINI_API_KEY) return { text: baseText, used: false, fallbackReason: 'missing_api_key' };
  if (aiCallCount >= config.aiCallsPerStudentLimit) {
    return { text: baseText, used: false, fallbackReason: 'limit_exceeded' };
  }

  try {
    const text = await callGemini({
      config,
      purpose,
      stage: args.stage,
      baseText,
      history: args.history,
    });

    return { text, used: true };
  } catch {
    return { text: baseText, used: false, fallbackReason: 'provider_error' };
  }
}
```

### 5-4. `lib/gemini.ts`

Gemini에는 다음 시스템 지침을 항상 포함한다.

```text
너는 초등학생을 돕는 HITL 프롬프트 빌더 보조자다.
학생의 생각을 대신 만들지 않는다.
교사의 수업 주제, 학습 목표, 필수 포함 요소, 금지 요소를 지킨다.
규칙 기반 단계와 다음 목표를 바꾸지 않는다.
질문은 한 번에 하나만 만든다.
초등학생이 이해할 수 있는 쉬운 한국어를 사용한다.
프롬프트 개선 시 학생이 말하지 않은 핵심 내용을 새로 추가하지 않는다.
```

목적별 동작:
- `question_polish`: 기본 질문을 더 자연스럽고 친근하게 다듬는다.
- `draft_prompt`: 규칙 기반 초안을 더 명확하고 구조적인 프롬프트로 다듬는다.
- `revise_prompt`: 학생 수정 요청이 이미 반영된 초안을 더 읽기 좋게 다듬는다.

---

## 6. API 흐름

### 6-1. `app/api/chat/route.ts`

```typescript
export async function POST(request: Request) {
  const { studentId, sessionId, message } = await request.json();

  // 1. session, student, history, latestPrompt 조회
  // 2. safety 검사
  // 3. 사용자 메시지 저장
  // 4. getNextFlow로 규칙 기반 결과 생성
  // 5. 학생별 ai_assist_logs count 조회
  // 6. maybeAssistWithAi로 질문/프롬프트 품질 보조 시도
  // 7. ai_assist_logs에 used/fallback_reason 저장
  // 8. assistant 메시지 저장
  // 9. draftPrompt가 있으면 prompts에 새 버전 저장
  //    - AI가 사용되었으면 source='ai_assisted'
  //    - AI가 사용되지 않았으면 flowResult.promptSource 또는 'rule'
  // 10. final이면 최신 prompt is_final=true 처리
  // 11. nextStage를 students.current_stage에 저장

  return Response.json({
    message: assistantMessage,
    stage: nextStage,
    draftPrompt,
    isFinal,
    aiUsed,
  });
}
```

중요 원칙:
- Gemini는 규칙 기반 결과를 대체하는 것이 아니라 개선한다.
- Gemini 실패 시 학생 플로우는 중단되지 않는다.
- 학생 화면에는 AI 실패를 오류로 노출하지 않는다.
- 교사 대시보드와 로그에는 AI 사용 여부와 fallback 사유를 남긴다.

---

## 7. 안전 필터

```typescript
// lib/safety.ts

const BLOCKED_PATTERNS = {
  profanity: [/시발|씨발|개새끼|병신|지랄|fuck|shit|bitch/gi],
  sexual: [/섹스|포르노|야동|음란/gi],
  meaningless: [/^(.)\1{9,}$/],
};

export type SafetyResult = {
  isSafe: boolean;
  alertType?: 'profanity' | 'off_topic' | 'meaningless';
  maskedContent?: string;
};

export function checkSafety(input: string): SafetyResult {
  for (const [type, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return {
          isSafe: false,
          alertType: type as SafetyResult['alertType'],
          maskedContent: input.replace(pattern, '***'),
        };
      }
    }
  }

  return { isSafe: true };
}

export function buildBlockedMessage(): string {
  return '이 내용은 오늘 수업 주제와 맞지 않아요. 선생님이 정한 주제 안에서 다시 생각해볼까요?';
}
```

---

## 8. 교사 대시보드

대시보드는 Supabase Realtime을 사용해 다음 이벤트를 구독한다.
- `messages` INSERT: 학생 마지막 활동 시간과 단계 업데이트
- `prompts` INSERT/UPDATE: 최종 프롬프트 상태 업데이트
- `safety_alerts` INSERT: 경고 피드 업데이트
- `ai_assist_logs` INSERT: 학생별 AI 보조 사용 횟수 업데이트

표시 항목:
- 완료/진행 중/미시작 학생 수
- 학생별 현재 단계
- 마지막 답변 시각
- 수정 루프 횟수
- 최종 프롬프트 여부
- 학생별 AI 보조 사용 횟수
- 안전 경고 수
- 상세 대화 보기
- CSV 내보내기

CSV 컬럼:
```text
student_name,current_stage,last_active_at,loop_count,ai_assist_count,final_prompt,alert_count
```

---

## 9. 환경 변수

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

`GEMINI_API_KEY`가 없어도 AI 보조는 fallback되고 규칙 기반 챗봇 플로우는 정상 동작해야 한다.

환경변수 원칙:
- `.env.local`은 로컬 개발용으로만 사용하고 GitHub에 커밋하지 않는다.
- `NEXT_PUBLIC_`로 시작하는 값은 브라우저에 노출될 수 있으므로 anon key처럼 공개 가능한 값만 둔다.
- `SUPABASE_SERVICE_ROLE_KEY`와 `GEMINI_API_KEY`는 서버 전용 Route Handler에서만 사용한다.
- Vercel Production, Preview, Development 환경에 필요한 값을 각각 등록한다.

---

## 10. GitHub 및 Vercel 배포

### 10-1. GitHub 저장소 준비

필수 파일:
```text
package.json
package-lock.json 또는 pnpm-lock.yaml
next.config.js 또는 next.config.mjs
tsconfig.json
.gitignore
README.md
```

`.gitignore`에는 최소한 다음 항목을 포함한다.

```gitignore
node_modules
.next
.vercel
.env
.env.local
.env.*.local
```

브랜치 운영:
- `main`: Production 배포 대상
- `develop` 또는 기능 브랜치: Preview 배포 확인 대상
- Pull Request에서 Vercel Preview URL로 학생/교사 플로우를 확인한 뒤 `main`에 병합한다.

### 10-2. Vercel 프로젝트 설정

배포 절차:
1. GitHub에 저장소를 생성한다.
2. Next.js 앱 코드를 저장소에 push한다.
3. Vercel에서 해당 GitHub 저장소를 Import한다.
4. Framework Preset은 `Next.js`로 설정한다.
5. 환경변수를 Vercel Project Settings에 등록한다.
6. 첫 배포 후 `/student/login`, `/teacher/login`, `/teacher/dashboard` 접근을 확인한다.

Vercel 환경변수:
```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

빌드 명령:
```bash
npm run build
```

런타임 주의:
- Supabase service role key는 클라이언트 컴포넌트에 전달하지 않는다.
- Gemini 호출은 서버 Route Handler에서만 수행한다.
- 학생 채팅 API는 AI 실패 시에도 200 응답과 규칙 기반 fallback 메시지를 반환한다.

### 10-3. 배포 전 체크리스트

- Supabase URL, anon key, service role key가 Vercel에 등록되어 있다.
- Gemini API key가 Vercel에 등록되어 있다.
- Supabase RLS가 활성화되어 있다.
- 학생 접속 코드는 세션 단위로 유일하게 검증된다.
- 교사 대시보드가 Realtime 이벤트를 수신한다.
- AI 보조 OFF 상태에서도 전체 학생 플로우가 동작한다.
- AI 보조 ON 상태에서 질문 개선, 프롬프트 개선, fallback 로그가 동작한다.
- `.env.local`이 GitHub에 올라가지 않았는지 확인한다.

---

## 11. 구현 단계

| 단계 | 내용 |
|---|---|
| Phase 1 | Next.js 앱 생성, 공통 레이아웃, 학생/교사 로그인 화면 이전 |
| Phase 2 | Supabase 스키마, 세션 설정, 학생 접속 코드 기능 구현 |
| Phase 3 | `flow.ts`, `prompt-builder.ts`, `safety.ts` 규칙 기반 엔진 구현 |
| Phase 4 | `ai-assist.ts`, `gemini.ts`, AI 사용 로그와 호출 한도 구현 |
| Phase 5 | 학생 챗봇 화면, 프롬프트 버전 저장, 최종 승인 구현 |
| Phase 6 | 교사 대시보드, 실시간 경고, AI 사용량 표시, CSV 내보내기 구현 |
| Phase 7 | GitHub 저장소 정리, Vercel Preview 배포, 환경변수 설정 |
| Phase 8 | 태블릿/PC 반응형 검증, 35명 동시 접속 및 AI fallback 시나리오 점검 |

---

## 12. 테스트 시나리오

| 시나리오 | 기대 결과 |
|---|---|
| AI 보조 OFF 상태에서 학생 대화 진행 | 모든 단계가 규칙 기반으로 정상 진행 |
| `GEMINI_API_KEY` 없음 | AI 보조가 fallback되고 학생 플로우는 중단되지 않음 |
| AI 보조 ON 상태에서 `explore`, `concrete`, `describe` 진행 | 질문 문장이 Gemini로 자연스럽게 개선되고 로그 기록 |
| AI 보조 ON 상태에서 `draft` 단계 도달 | 프롬프트가 AI 보조 버전으로 저장되고 `source='ai_assisted'` 기록 |
| 학생이 수정 요청 | 기존 프롬프트 유지, 새 버전 저장, 필요 시 AI 보조 적용 |
| 학생당 AI 호출 한도 초과 | 이후 AI 호출 없이 규칙 기반 fallback |
| 교사가 세션 AI 보조를 끔 | 즉시 AI 호출 중단 |
| Ctrl+V 시도 | 입력 차단, 교사 대시보드 경고 기록 |
| 욕설 입력 | 차단 메시지 표시, `safety_alerts` 저장 |
| 교사 대시보드 접속 | 학생 단계, 루프 횟수, AI 보조 횟수, 최종 프롬프트, 경고 현황 표시 |
| Vercel Preview 배포 접속 | 학생/교사 로그인 페이지와 주요 API가 정상 응답 |
| GitHub 저장소 확인 | `.env.local`, service role key, Gemini API key가 커밋되지 않음 |
