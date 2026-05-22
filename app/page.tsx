"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Gauge,
  KeyRound,
  Loader2,
  LogIn,
  MessageSquareText,
  Monitor,
  PenLine,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SESSION, STAGES } from "@/lib/defaults";
import { getInitialAssistantMessage } from "@/lib/flow";
import { loadAppState, saveAppState } from "@/lib/supabase-state";
import type { AiAssistLog, ChatMessage, PromptRecord, SafetyAlert, SessionConfig, StudentWorkspace } from "@/lib/types";

type View = "home" | "student-login" | "student-chat" | "teacher-login" | "teacher-settings" | "monitoring";

const STORAGE_KEY = "hitl-chat-state-v1";

type AppState = {
  session: SessionConfig;
  students: StudentWorkspace[];
};

const initialState: AppState = {
  session: DEFAULT_SESSION,
  students: []
};

export default function AppPage() {
  const [view, setView] = useState<View>("home");
  const [state, setState] = useState<AppState>(initialState);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const activeStudent = state.students.find((student) => student.id === activeStudentId) ?? null;

  useEffect(() => {
    let isCancelled = false;

    async function loadState() {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      let nextState = initialState;

      try {
        if (saved) nextState = JSON.parse(saved) as AppState;
      } catch {
        nextState = initialState;
      }

      const remoteState = await loadAppState<AppState>();
      if (remoteState) nextState = remoteState;

      if (!isCancelled) {
        setState(nextState);
        setIsStateLoaded(true);
      }
    }

    loadState();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const saveTimer = window.setTimeout(() => {
      void saveAppState(state);
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [state, isStateLoaded]);

  function updateSession(session: SessionConfig) {
    setState((current) => ({ ...current, session }));
  }

  function upsertStudent(student: StudentWorkspace) {
    setState((current) => ({
      ...current,
      students: current.students.some((item) => item.id === student.id)
        ? current.students.map((item) => (item.id === student.id ? student : item))
        : [...current.students, student]
    }));
  }

  function resetDemo() {
    setState(initialState);
    setActiveStudentId(null);
    setView("home");
  }

  return (
    <main className="app-shell">
      <TopBar view={view} setView={setView} />
      {view === "home" && <HomeView session={state.session} setView={setView} resetDemo={resetDemo} />}
      {view === "student-login" && (
        <StudentLoginView
          session={state.session}
          students={state.students}
          onEnter={(student) => {
            upsertStudent(student);
            setActiveStudentId(student.id);
            setView("student-chat");
          }}
        />
      )}
      {view === "student-chat" && activeStudent && (
        <StudentChatView session={state.session} student={activeStudent} onChange={upsertStudent} setView={setView} />
      )}
      {view === "student-chat" && !activeStudent && <EmptyStudentState setView={setView} />}
      {view === "teacher-login" && <TeacherLoginView setView={setView} />}
      {view === "teacher-settings" && <TeacherSettingsView session={state.session} onSave={updateSession} setView={setView} />}
      {view === "monitoring" && <MonitoringView session={state.session} students={state.students} setView={setView} />}
    </main>
  );
}

function TopBar({ view, setView }: { view: View; setView: (view: View) => void }) {
  const nav = [
    { label: "학생 입장", view: "student-login" as View },
    { label: "교사 설정", view: "teacher-settings" as View },
    { label: "모니터링", view: "monitoring" as View }
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/86 backdrop-blur">
      <div className="page-band flex min-h-16 items-center justify-between gap-4 py-3">
        <button className="flex items-center gap-3 text-left" onClick={() => setView("home")} title="처음 화면">
          <span className="grid h-11 w-11 place-items-center rounded-[8px] bg-primary text-white">
            <Bot size={24} />
          </span>
          <span>
            <span className="block text-base font-black text-ink sm:text-lg">HITL Prompt Builder</span>
            <span className="hidden text-sm font-semibold text-muted sm:block">교사 주제 기반 하이브리드 챗봇</span>
          </span>
        </button>
        <nav className="flex items-center gap-2 overflow-x-auto">
          {nav.map((item) => (
            <button
              key={item.view}
              className={`rounded-[8px] px-3 py-2 text-sm font-bold transition ${
                view === item.view ? "bg-primary text-white" : "bg-white text-muted hover:bg-primarySoft hover:text-primary"
              }`}
              onClick={() => setView(item.view)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function HomeView({ session, setView, resetDemo }: { session: SessionConfig; setView: (view: View) => void; resetDemo: () => void }) {
  return (
    <section className="page-band grid gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      <div className="py-6">
        <p className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-primary/20 bg-primarySoft px-3 py-2 text-sm font-black text-primary">
          <Sparkles size={16} /> 규칙 기반 플로우 + Gemini 품질 보조
        </p>
        <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
          교사가 주제를 열고, 학생은 대화하며 프롬프트를 완성합니다.
        </h1>
        <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-muted">
          이 버전은 SPA처럼 동작하는 Next.js MVP입니다. 교사 설정, 학생 채팅, 모니터링을 한 화면 앱으로 검증하고,
          Vercel 배포와 Supabase 연결을 다음 단계로 이어갈 수 있게 구성했습니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => setView("teacher-settings")} icon={<Settings size={18} />}>
            교사 설정 시작
          </PrimaryButton>
          <SecondaryButton onClick={() => setView("student-login")} icon={<LogIn size={18} />}>
            학생으로 입장
          </SecondaryButton>
          <GhostButton onClick={resetDemo}>데모 초기화</GhostButton>
        </div>
      </div>
      <div className="grid gap-4">
        <InfoPanel title="현재 세션" icon={<ClipboardList size={20} />}>
          <dl className="grid gap-3 text-sm">
            <InfoRow label="접속 코드" value={session.accessCode} />
            <InfoRow label="수업 주제" value={session.topic} />
            <InfoRow label="산출물" value={session.outputType} />
            <InfoRow label="AI 보조" value={session.aiEnabled ? `ON · 학생당 ${session.aiCallsPerStudentLimit}회` : "OFF · 규칙 기반"} />
          </dl>
        </InfoPanel>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "교사 설정", "주제와 AI 보조 정책을 정합니다."],
            ["2", "학생 대화", "7단계 플로우로 답변을 모읍니다."],
            ["3", "최종 승인", "학생 승인 후 교사가 확인합니다."]
          ].map(([step, title, copy]) => (
            <div key={step} className="rounded-[8px] border border-line bg-white p-4 shadow-soft">
              <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-secondarySoft text-sm font-black text-secondary">{step}</span>
              <h3 className="mt-4 font-black text-ink">{title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StudentLoginView({
  session,
  students,
  onEnter
}: {
  session: SessionConfig;
  students: StudentWorkspace[];
  onEnter: (student: StudentWorkspace) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(session.accessCode);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode !== session.accessCode.toUpperCase()) {
      setError("접속 코드가 맞지 않아요. 선생님이 알려준 코드를 다시 확인해줘.");
      return;
    }

    if (!name.trim()) {
      setError("이름을 입력해줘.");
      return;
    }

    const existing = students.find((student) => student.name === name.trim() && student.accessCode === normalizedCode);
    const now = new Date().toISOString();
    const student: StudentWorkspace =
      existing ??
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        accessCode: normalizedCode,
        currentStage: "orient",
        lastActiveAt: now,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: getInitialAssistantMessage(session),
            stage: "orient",
            createdAt: now
          }
        ],
        prompts: [],
        safetyAlerts: [],
        aiLogs: []
      };

    onEnter({ ...student, lastActiveAt: now });
  }

  return (
    <section className="page-band grid min-h-[calc(100vh-72px)] place-items-center py-10">
      <form className="w-full max-w-[520px] rounded-[8px] border border-line bg-white p-6 shadow-soft" onSubmit={submit}>
        <span className="grid h-12 w-12 place-items-center rounded-[8px] bg-primarySoft text-primary">
          <KeyRound size={24} />
        </span>
        <h1 className="mt-5 text-3xl font-black text-ink">학생 입장</h1>
        <p className="mt-2 font-semibold leading-7 text-muted">선생님이 알려준 접속 코드와 이름을 입력하면 채팅을 시작합니다.</p>
        <div className="mt-6 grid gap-4">
          <TextField label="이름" value={name} onChange={setName} placeholder="예: 김하늘" />
          <TextField label="접속 코드" value={code} onChange={(value) => setCode(value.toUpperCase())} placeholder="예: HITL35" />
        </div>
        {error && <p className="mt-4 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
        <PrimaryButton className="mt-6 w-full justify-center" icon={<LogIn size={18} />}>
          채팅 시작
        </PrimaryButton>
      </form>
    </section>
  );
}

function StudentChatView({
  session,
  student,
  onChange,
  setView
}: {
  session: SessionConfig;
  student: StudentWorkspace;
  onChange: (student: StudentWorkspace) => void;
  setView: (view: View) => void;
}) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestPrompt = student.prompts.at(-1);
  const finalPrompt = student.prompts.find((prompt) => prompt.isFinal);
  const stageIndex = STAGES.findIndex((stage) => stage.stage === student.currentStage);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [student.messages.length]);

  function addPasteAlert(content: string) {
    const alert: SafetyAlert = {
      id: crypto.randomUUID(),
      alertType: "paste_attempt",
      attemptedContent: content,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    onChange({ ...student, safetyAlerts: [...student.safetyAlerts, alert], lastActiveAt: new Date().toISOString() });
  }

  async function sendMessage(message = input) {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: session,
          history: student.messages,
          message: trimmed,
          currentStage: student.currentStage,
          latestPrompt: latestPrompt?.content,
          loopCount: latestPrompt?.loopCount ?? 0,
          aiCallCount: student.aiLogs.filter((log) => log.used).length
        })
      });

      const result = await response.json();
      const now = new Date().toISOString();

      if (result.blocked) {
        const alert: SafetyAlert = {
          id: crypto.randomUUID(),
          alertType: result.alertType,
          attemptedContent: trimmed,
          isRead: false,
          createdAt: now
        };
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.message,
          stage: student.currentStage,
          createdAt: now
        };
        onChange({
          ...student,
          messages: [...student.messages, assistantMessage],
          safetyAlerts: [...student.safetyAlerts, alert],
          lastActiveAt: now
        });
        return;
      }

      const prompts = [...student.prompts];
      if (result.shouldCreatePrompt && result.draftPrompt) {
        prompts.push({
          id: crypto.randomUUID(),
          version: prompts.length + 1,
          content: result.draftPrompt,
          isFinal: false,
          loopCount: prompts.length,
          source: result.promptSource,
          createdAt: now
        });
      }

      if (result.isFinal && prompts.length > 0) {
        prompts[prompts.length - 1] = { ...prompts[prompts.length - 1], isFinal: true };
      }

      onChange({
        ...student,
        currentStage: result.stage,
        messages: [...student.messages, result.userMessage, result.assistantMessage],
        prompts,
        aiLogs: result.aiLog ? [...student.aiLogs, result.aiLog as AiAssistLog] : student.aiLogs,
        lastActiveAt: now
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="page-band grid gap-5 py-6 lg:grid-cols-[1fr_340px]">
      <div className="min-h-[calc(100vh-120px)] rounded-[8px] border border-line bg-white shadow-soft">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-primary">{session.topic}</p>
              <h1 className="text-2xl font-black text-ink">{student.name}의 프롬프트 대화</h1>
            </div>
            <span className="rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-black text-secondary">
              {STAGES[Math.max(stageIndex, 0)]?.label ?? "진행 중"}
            </span>
          </div>
          <StageProgress currentStage={student.currentStage} />
        </div>
        <div ref={scrollRef} className="h-[calc(100vh-330px)] min-h-[380px] space-y-4 overflow-y-auto p-4">
          {student.messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isSending && (
            <div className="flex items-center gap-2 rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-bold text-secondary">
              <Loader2 className="animate-spin" size={16} /> 답변을 정리하는 중
            </div>
          )}
        </div>
        <form
          className="border-t border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <textarea
            className="focus-ring min-h-24 w-full rounded-[8px] border border-line bg-surface p-3 font-semibold leading-7 text-ink"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              addPasteAlert(event.clipboardData.getData("text"));
              event.preventDefault();
            }}
            onContextMenu={(event) => event.preventDefault()}
            placeholder={student.currentStage === "revise" ? "수정할 점을 쓰거나, 이걸로 확정할래요 라고 입력해줘." : "네 생각을 직접 적어줘."}
            disabled={student.currentStage === "final"}
          />
          <div className="mt-3 flex flex-wrap justify-between gap-3">
            <div className="flex gap-2">
              {student.currentStage === "revise" && (
                <>
                  <SecondaryButton type="button" onClick={() => sendMessage("조금 더 구체적으로 수정하고 싶어요")} icon={<PenLine size={18} />}>
                    수정할래요
                  </SecondaryButton>
                  <PrimaryButton type="button" onClick={() => sendMessage("이걸로 확정할래요")} icon={<Check size={18} />}>
                    확정할래요
                  </PrimaryButton>
                </>
              )}
            </div>
            <PrimaryButton disabled={isSending || student.currentStage === "final"} icon={<ChevronRight size={18} />}>
              보내기
            </PrimaryButton>
          </div>
        </form>
      </div>
      <aside className="space-y-4">
        <InfoPanel title="현재 초안" icon={<MessageSquareText size={20} />}>
          {latestPrompt ? (
            <div>
              <p className="mb-2 text-sm font-black text-muted">버전 {latestPrompt.version} · {sourceLabel(latestPrompt.source)}</p>
              <p className="whitespace-pre-wrap rounded-[8px] bg-surface p-3 text-sm font-semibold leading-6 text-ink">{latestPrompt.content}</p>
              {finalPrompt && <p className="mt-3 rounded-[8px] bg-primarySoft px-3 py-2 text-sm font-black text-primary">최종 승인 완료</p>}
            </div>
          ) : (
            <p className="text-sm font-semibold leading-6 text-muted">학생 답변이 충분히 모이면 초안이 여기에 표시됩니다.</p>
          )}
        </InfoPanel>
        <InfoPanel title="AI 보조" icon={<Sparkles size={20} />}>
          <p className="text-sm font-semibold leading-6 text-muted">
            {session.aiEnabled ? `ON · 사용 ${student.aiLogs.filter((log) => log.used).length}/${session.aiCallsPerStudentLimit}회` : "OFF · 규칙 기반 질문과 초안으로 진행 중"}
          </p>
        </InfoPanel>
        <SecondaryButton className="w-full justify-center" onClick={() => setView("monitoring")} icon={<Monitor size={18} />}>
          교사 모니터링 보기
        </SecondaryButton>
      </aside>
    </section>
  );
}

function TeacherLoginView({ setView }: { setView: (view: View) => void }) {
  return (
    <section className="page-band grid min-h-[calc(100vh-72px)] place-items-center py-10">
      <div className="w-full max-w-[520px] rounded-[8px] border border-line bg-white p-6 shadow-soft">
        <span className="grid h-12 w-12 place-items-center rounded-[8px] bg-secondarySoft text-secondary">
          <UserRound size={24} />
        </span>
        <h1 className="mt-5 text-3xl font-black text-ink">교사 입장</h1>
        <p className="mt-2 font-semibold leading-7 text-muted">
          MVP에서는 별도 인증 없이 설정 화면으로 이동합니다. 실제 배포 단계에서는 Supabase Auth를 연결합니다.
        </p>
        <PrimaryButton className="mt-6 w-full justify-center" onClick={() => setView("teacher-settings")} icon={<LogIn size={18} />}>
          설정 화면으로 이동
        </PrimaryButton>
      </div>
    </section>
  );
}

function TeacherSettingsView({
  session,
  onSave,
  setView
}: {
  session: SessionConfig;
  onSave: (session: SessionConfig) => void;
  setView: (view: View) => void;
}) {
  const [draft, setDraft] = useState(session);
  const requiredText = draft.requiredElements.join(", ");
  const constraintsText = draft.constraints.join(", ");

  function save() {
    onSave({
      ...draft,
      requiredElements: splitList(requiredText),
      constraints: splitList(constraintsText)
    });
    setView("monitoring");
  }

  return (
    <section className="page-band grid gap-5 py-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[8px] border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-primary">교사 설정</p>
            <h1 className="text-3xl font-black text-ink">수업 주제와 AI 보조 정책</h1>
          </div>
          <PrimaryButton onClick={save} icon={<Save size={18} />}>
            저장하고 모니터링
          </PrimaryButton>
        </div>
        <div className="mt-6 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="수업 제목" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} />
            <TextField label="학생 접속 코드" value={draft.accessCode} onChange={(value) => setDraft({ ...draft, accessCode: value.toUpperCase() })} />
          </div>
          <TextField label="수업 주제" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} />
          <TextArea label="학습 목표" value={draft.learningGoal} onChange={(value) => setDraft({ ...draft, learningGoal: value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="최종 산출물 유형" value={draft.outputType} onChange={(value) => setDraft({ ...draft, outputType: value })} />
            <NumberField
              label="최대 수정 루프 수"
              value={draft.maxLoopCount}
              min={1}
              max={5}
              onChange={(value) => setDraft({ ...draft, maxLoopCount: value })}
            />
          </div>
          <TextArea
            label="필수 포함 요소"
            value={requiredText}
            onChange={(value) => setDraft({ ...draft, requiredElements: splitList(value) })}
            placeholder="쉼표로 구분: 장소, 주요 대상, 문제 해결 방법"
          />
          <TextArea
            label="금지/주의 요소"
            value={constraintsText}
            onChange={(value) => setDraft({ ...draft, constraints: splitList(value) })}
            placeholder="쉼표로 구분: 주제 이탈 금지, 혐오 표현 금지"
          />
          <div>
            <h2 className="text-lg font-black text-ink">질문 단계</h2>
            <div className="mt-3 grid gap-3">
              {draft.questionFlow.slice(0, 4).map((item, index) => (
                <label key={item.stage} className="grid gap-2">
                  <span className="text-sm font-black text-muted">{index + 1}. {item.label}</span>
                  <input
                    className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink"
                    value={item.question}
                    onChange={(event) => {
                      const questionFlow = draft.questionFlow.map((flow) =>
                        flow.stage === item.stage ? { ...flow, question: event.target.value } : flow
                      );
                      setDraft({ ...draft, questionFlow });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      <aside className="space-y-4">
        <InfoPanel title="AI 보조 설정" icon={<Sparkles size={20} />}>
          <label className="flex items-center justify-between gap-3 rounded-[8px] bg-surface p-3">
            <span>
              <span className="block font-black text-ink">Gemini 보조</span>
              <span className="text-sm font-semibold text-muted">질문 문장과 프롬프트 품질만 개선</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={draft.aiEnabled}
              onChange={(event) => setDraft({ ...draft, aiEnabled: event.target.checked })}
            />
          </label>
          <div className="mt-4 grid gap-3">
            <NumberField
              label="학생당 AI 호출 한도"
              value={draft.aiCallsPerStudentLimit}
              min={0}
              max={20}
              onChange={(value) => setDraft({ ...draft, aiCallsPerStudentLimit: value })}
            />
            <p className="rounded-[8px] bg-warningSoft px-3 py-2 text-sm font-bold leading-6 text-warning">
              GEMINI_API_KEY가 없거나 한도를 넘으면 자동으로 규칙 기반 결과를 사용합니다.
            </p>
          </div>
        </InfoPanel>
        <InfoPanel title="배포 준비" icon={<ShieldCheck size={20} />}>
          <ul className="space-y-2 text-sm font-semibold leading-6 text-muted">
            <li>GitHub에는 .env.local을 올리지 않습니다.</li>
            <li>Vercel 환경변수에 Gemini/Supabase 키를 넣습니다.</li>
            <li>현재 MVP는 브라우저 저장소로 먼저 동작합니다.</li>
          </ul>
        </InfoPanel>
      </aside>
    </section>
  );
}

function MonitoringView({ session, students, setView }: { session: SessionConfig; students: StudentWorkspace[]; setView: (view: View) => void }) {
  const stats = useMemo(() => {
    const finalCount = students.filter((student) => student.prompts.some((prompt) => prompt.isFinal)).length;
    const alertCount = students.reduce((sum, student) => sum + student.safetyAlerts.length, 0);
    const aiCount = students.reduce((sum, student) => sum + student.aiLogs.filter((log) => log.used).length, 0);
    return { finalCount, alertCount, aiCount };
  }, [students]);

  function downloadCsv() {
    const header = ["student_name", "current_stage", "last_active_at", "loop_count", "ai_assist_count", "final_prompt", "alert_count"];
    const rows = students.map((student) => {
      const latest = student.prompts.at(-1);
      const final = student.prompts.find((prompt) => prompt.isFinal);
      return [
        student.name,
        student.currentStage,
        student.lastActiveAt,
        latest?.loopCount ?? 0,
        student.aiLogs.filter((log) => log.used).length,
        final?.content ?? latest?.content ?? "",
        student.safetyAlerts.length
      ];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hitl-monitoring.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page-band py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-primary">{session.title}</p>
          <h1 className="text-3xl font-black text-ink">교사 모니터링</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setView("teacher-settings")} icon={<Settings size={18} />}>
            설정 수정
          </SecondaryButton>
          <PrimaryButton onClick={downloadCsv} icon={<Download size={18} />}>
            CSV 내보내기
          </PrimaryButton>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <StatCard icon={<UserRound size={20} />} label="참여 학생" value={`${students.length}명`} />
        <StatCard icon={<Check size={20} />} label="최종 완료" value={`${stats.finalCount}명`} />
        <StatCard icon={<Sparkles size={20} />} label="AI 보조 사용" value={`${stats.aiCount}회`} />
        <StatCard icon={<AlertTriangle size={20} />} label="안전 경고" value={`${stats.alertCount}건`} />
      </div>
      <div className="mt-5 overflow-hidden rounded-[8px] border border-line bg-white shadow-soft">
        <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_1.4fr] gap-3 border-b border-line bg-surface px-4 py-3 text-sm font-black text-muted max-lg:hidden">
          <span>학생</span>
          <span>현재 단계</span>
          <span>수정</span>
          <span>AI</span>
          <span>경고</span>
          <span>프롬프트 상태</span>
        </div>
        {students.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-bold text-muted">아직 입장한 학생이 없습니다.</p>
            <SecondaryButton className="mt-4" onClick={() => setView("student-login")} icon={<LogIn size={18} />}>
              학생 입장 화면 열기
            </SecondaryButton>
          </div>
        ) : (
          students.map((student) => {
            const latest = student.prompts.at(-1);
            const final = student.prompts.find((prompt) => prompt.isFinal);
            return (
              <div
                key={student.id}
                className="grid gap-3 border-b border-line px-4 py-4 text-sm font-semibold text-ink last:border-b-0 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr_1.4fr]"
              >
                <span>
                  <strong className="block text-base">{student.name}</strong>
                  <span className="text-muted">{formatTime(student.lastActiveAt)}</span>
                </span>
                <span>{stageLabel(student.currentStage)}</span>
                <span>{latest?.loopCount ?? 0}회</span>
                <span>{student.aiLogs.filter((log) => log.used).length}회</span>
                <span className={student.safetyAlerts.length > 0 ? "text-danger" : "text-muted"}>{student.safetyAlerts.length}건</span>
                <span className="truncate">{final ? "최종 완료" : latest ? `초안 v${latest.version}` : "대화 중"}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function EmptyStudentState({ setView }: { setView: (view: View) => void }) {
  return (
    <section className="page-band grid min-h-[calc(100vh-72px)] place-items-center">
      <div className="rounded-[8px] border border-line bg-white p-6 text-center shadow-soft">
        <p className="font-bold text-muted">먼저 학생으로 입장해야 합니다.</p>
        <PrimaryButton className="mt-4" onClick={() => setView("student-login")} icon={<LogIn size={18} />}>
          학생 입장
        </PrimaryButton>
      </div>
    </section>
  );
}

function StageProgress({ currentStage }: { currentStage: string }) {
  const currentIndex = STAGES.findIndex((item) => item.stage === currentStage);
  return (
    <div className="mt-4 grid grid-cols-7 gap-2">
      {STAGES.map((item, index) => (
        <div key={item.stage} className="min-w-0">
          <div className={`h-2 rounded-full ${index <= currentIndex ? "bg-primary" : "bg-line"}`} />
          <p className={`mt-1 truncate text-xs font-black ${index <= currentIndex ? "text-primary" : "text-muted"}`}>{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] whitespace-pre-wrap rounded-[8px] px-4 py-3 text-sm font-semibold leading-7 ${
          isUser ? "bg-primary text-white" : "bg-surface text-ink"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}

function InfoPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[8px] border border-line bg-white p-4 shadow-soft">
      <h2 className="mb-4 flex items-center gap-2 font-black text-ink">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-[8px] bg-surface p-3">
      <dt className="text-xs font-black uppercase text-muted">{label}</dt>
      <dd className="font-bold leading-6 text-ink">{value}</dd>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-primary">{icon}</span>
        <span className="text-2xl font-black text-ink">{value}</span>
      </div>
      <p className="mt-3 text-sm font-black text-muted">{label}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input
        className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <textarea
        className="focus-ring min-h-24 rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold leading-7 text-ink"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PrimaryButton({
  children,
  icon,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#005a2d] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  icon,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-[8px] border border-primary/25 bg-primarySoft px-4 py-3 text-sm font-black text-primary transition hover:border-primary ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`rounded-[8px] px-4 py-3 text-sm font-black text-muted transition hover:bg-white hover:text-ink ${className}`} {...props}>
      {children}
    </button>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stageLabel(stage: string) {
  return STAGES.find((item) => item.stage === stage)?.label ?? stage;
}

function sourceLabel(source: PromptRecord["source"]) {
  if (source === "ai_assisted") return "AI 보조";
  if (source === "student_revision") return "학생 수정";
  return "규칙 기반";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
