"use client";

import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardList,
  Copy,
  Download,
  KeyRound,
  Loader2,
  LogIn,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SESSION, STAGES } from "@/lib/defaults";
import { getInitialAssistantMessage } from "@/lib/flow";
import { loadAppState, saveAppState } from "@/lib/supabase-state";
import type { AiAssistLog, ChatMessage, PromptRecord, SafetyAlert, SessionConfig, Stage, StudentAnalysis, StudentWorkspace } from "@/lib/types";

type View = "home" | "student-login" | "student-chat" | "teacher-auth" | "teacher-settings" | "monitoring";
type TeacherView = "teacher-settings" | "monitoring";

type AppData = {
  session: SessionConfig;
  students: StudentWorkspace[];
};

type UiState = {
  view: View;
  isTeacherUnlocked: boolean;
  isTeacherStudentPreview: boolean;
  pendingTeacherView: TeacherView;
  activeStudentId: string | null;
};

const DATA_STORAGE_KEY = "hitl-chat-state-v2";
const UI_STORAGE_KEY = "hitl-chat-ui-v2";
const APP_NAME = "생각잇기 프롬프트";
const APP_SUBTITLE = "학생 답변 기반 이미지 생성 프롬프트 수업 도구";
const TEACHER_PIN = process.env.NEXT_PUBLIC_TEACHER_PIN ?? "1234";

const initialData: AppData = {
  session: DEFAULT_SESSION,
  students: []
};

const LEGACY_DEFAULT_TOPIC = "기후 위기를 줄이는 미래 도시";
const LEGACY_DEFAULT_QUESTION_START = `오늘 주제는 "${LEGACY_DEFAULT_TOPIC}"`;

const initialUi: UiState = {
  view: "home",
  isTeacherUnlocked: false,
  isTeacherStudentPreview: false,
  pendingTeacherView: "teacher-settings",
  activeStudentId: null
};

export default function AppPage() {
  const [data, setData] = useState<AppData>(initialData);
  const [ui, setUi] = useState<UiState>(initialUi);
  const [isLoaded, setIsLoaded] = useState(false);
  const activeStudent = data.students.find((student) => student.id === ui.activeStudentId) ?? null;

  useEffect(() => {
    let isCancelled = false;

    async function loadState() {
      let nextData = initialData;
      let nextUi = initialUi;

      try {
        const savedData = window.localStorage.getItem(DATA_STORAGE_KEY);
        if (savedData) nextData = { ...initialData, ...(JSON.parse(savedData) as AppData) };
      } catch {
        nextData = initialData;
      }

      try {
        const savedUi = window.localStorage.getItem(UI_STORAGE_KEY);
        if (savedUi) nextUi = { ...initialUi, ...(JSON.parse(savedUi) as UiState) };
      } catch {
        nextUi = initialUi;
      }

      const remoteData = await loadAppState<AppData>();
      if (remoteData?.session && remoteData?.students) {
        nextData = remoteData;
      }

      nextData = migrateSavedData(nextData);

      const role = new URLSearchParams(window.location.search).get("role");
      if (role === "student") {
        nextUi = {
          ...nextUi,
          view: nextUi.activeStudentId ? "student-chat" : "student-login",
          isTeacherStudentPreview: false
        };
      } else if (nextUi.view === "student-login" || nextUi.view === "student-chat" || nextUi.view === "teacher-auth") {
        nextUi = {
          ...nextUi,
          view: nextUi.isTeacherUnlocked ? "teacher-settings" : "home",
          isTeacherStudentPreview: false,
          activeStudentId: null
        };
      }

      if (nextUi.view === "student-chat" && !nextData.students.some((student) => student.id === nextUi.activeStudentId)) {
        nextUi = { ...nextUi, view: "student-login", activeStudentId: null };
      }

      if (!isCancelled) {
        setData(nextData);
        setUi(nextUi);
        setIsLoaded(true);
      }
    }

    loadState();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    window.localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
    const saveTimer = window.setTimeout(() => {
      void saveAppState(data);
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [data, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui));
  }, [ui, isLoaded]);

  function setView(view: View) {
    setUi((current) => ({ ...current, view, isTeacherStudentPreview: view === "student-login" || view === "student-chat" ? current.isTeacherStudentPreview : false }));
  }

  function updateSession(session: SessionConfig) {
    setData((current) => ({ ...current, session }));
  }

  function upsertStudent(student: StudentWorkspace) {
    setData((current) => ({
      ...current,
      students: current.students.some((item) => item.id === student.id)
        ? current.students.map((item) => (item.id === student.id ? student : item))
        : [...current.students, student]
    }));
  }

  function resetStudent(studentId: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? {
              ...student,
              currentStage: "orient",
              lastActiveAt: now,
              messages: [createAssistantMessage(getInitialAssistantMessage(current.session), "orient")],
              prompts: [],
              safetyAlerts: [],
              aiLogs: [],
              analysis: undefined
            }
          : student
      )
    }));
  }

  function deleteStudent(studentId: string) {
    setData((current) => ({ ...current, students: current.students.filter((student) => student.id !== studentId) }));
    setUi((current) => ({ ...current, activeStudentId: current.activeStudentId === studentId ? null : current.activeStudentId }));
  }

  function clearStudents() {
    setData((current) => ({ ...current, students: [] }));
    setUi((current) => ({ ...current, activeStudentId: null }));
  }

  function resetDemo() {
    setData(initialData);
    setUi(initialUi);
  }

  function openTeacherView(target: TeacherView) {
    if (ui.isTeacherUnlocked) {
      setUi((current) => ({ ...current, view: target, isTeacherStudentPreview: false }));
      return;
    }

    setUi((current) => ({ ...current, pendingTeacherView: target, view: "teacher-auth", isTeacherStudentPreview: false }));
  }

  function unlockTeacher(pin: string) {
    if (pin.trim() !== TEACHER_PIN) return false;
    setUi((current) => ({ ...current, isTeacherUnlocked: true, view: current.pendingTeacherView, isTeacherStudentPreview: false }));
    return true;
  }

  function openStudentPreview() {
    setUi((current) => ({ ...current, view: "student-login", isTeacherStudentPreview: true, activeStudentId: null }));
  }

  if (!isLoaded) {
    return (
      <main className="app-shell grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 rounded-[8px] bg-white px-4 py-3 text-sm font-black text-primary shadow-soft">
          <Loader2 className="animate-spin" size={16} /> 수업 상태를 불러오는 중
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TopBar view={ui.view} setView={setView} openTeacherView={openTeacherView} openStudentPreview={openStudentPreview} isTeacherStudentPreview={ui.isTeacherStudentPreview} />
      {ui.view === "home" && <HomeView session={data.session} setView={setView} openTeacherView={openTeacherView} openStudentPreview={openStudentPreview} resetDemo={resetDemo} />}
      {ui.view === "student-login" && (
        <StudentLoginView
          session={data.session}
          students={data.students}
          onEnter={(student) => {
            upsertStudent(student);
            setUi((current) => ({ ...current, activeStudentId: student.id, view: "student-chat" }));
          }}
        />
      )}
      {ui.view === "student-chat" && activeStudent && <StudentChatView session={data.session} student={activeStudent} onChange={upsertStudent} onReset={() => resetStudent(activeStudent.id)} />}
      {ui.view === "student-chat" && !activeStudent && <EmptyStudentState setView={setView} />}
      {ui.view === "teacher-auth" && <TeacherAuthView onUnlock={unlockTeacher} />}
      {ui.view === "teacher-settings" && <TeacherSettingsView session={data.session} onSave={updateSession} setView={setView} />}
      {ui.view === "monitoring" && (
        <MonitoringView
          session={data.session}
          students={data.students}
          setView={setView}
          openTeacherView={openTeacherView}
          onUpdateStudent={upsertStudent}
          onDeleteStudent={deleteStudent}
          onClearStudents={clearStudents}
        />
      )}
    </main>
  );
}

function migrateSavedData(data: AppData): AppData {
  const questionFlow = data.session.questionFlow ?? [];
  const looksLikeLegacyDefault =
    data.session.topic === LEGACY_DEFAULT_TOPIC &&
    questionFlow.some((item) => item.stage === "orient" && item.question.startsWith(LEGACY_DEFAULT_QUESTION_START));

  if (!looksLikeLegacyDefault) return data;

  return {
    ...data,
    session: {
      ...data.session,
      requiredElements: [],
      constraints: [],
      questionFlow: []
    }
  };
}

function TopBar({
  view,
  setView,
  openTeacherView,
  openStudentPreview,
  isTeacherStudentPreview
}: {
  view: View;
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  openStudentPreview: () => void;
  isTeacherStudentPreview: boolean;
}) {
  const isStudentView = view === "student-login" || view === "student-chat";
  const shouldHideTeacherNav = isStudentView && !isTeacherStudentPreview;

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/86 backdrop-blur">
      <div className="page-band flex min-h-16 items-center justify-between gap-4 py-3">
        <button type="button" className="flex items-center gap-3 text-left" onClick={() => setView(shouldHideTeacherNav ? "student-login" : "home")} title="처음 화면">
          <span className="grid h-11 w-11 place-items-center rounded-[8px] bg-primary text-white">
            <Bot size={24} />
          </span>
          <span>
            <span className="block text-base font-black text-ink sm:text-lg">{APP_NAME}</span>
            <span className="hidden text-sm font-semibold text-muted sm:block">{APP_SUBTITLE}</span>
          </span>
        </button>
        {!shouldHideTeacherNav && (
          <nav className="flex items-center gap-2 overflow-x-auto">
            <NavButton active={view === "teacher-settings"} onClick={() => openTeacherView("teacher-settings")}>
              수업 설정
            </NavButton>
            <NavButton active={view === "monitoring"} onClick={() => openTeacherView("monitoring")}>
              모니터링
            </NavButton>
            <NavButton active={isTeacherStudentPreview && isStudentView} onClick={openStudentPreview}>
              학생 입장 확인
            </NavButton>
          </nav>
        )}
      </div>
    </header>
  );
}

function HomeView({
  session,
  setView,
  openTeacherView,
  openStudentPreview,
  resetDemo
}: {
  session: SessionConfig;
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  openStudentPreview: () => void;
  resetDemo: () => void;
}) {
  const studentLink = typeof window === "undefined" ? "" : `${window.location.origin}?role=student`;

  return (
    <section className="page-band grid gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      <div className="py-6">
        <p className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-primary/20 bg-primarySoft px-3 py-2 text-sm font-black text-primary">
          <Sparkles size={16} /> 교사용 수업 콘솔
        </p>
        <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">학생의 생각을 모아 이미지 생성 프롬프트로 완성합니다.</h1>
        <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-muted">
          교사는 수업 주제와 질문 흐름을 설계하고, 챗봇은 학생 답변 맥락에 맞게 질문을 이어갑니다. 최종 프롬프트는 학생 답변에 근거해 만들고 학생이 승인합니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryButton onClick={() => openTeacherView("teacher-settings")} icon={<Settings size={18} />}>
            수업 설정 시작
          </PrimaryButton>
          <SecondaryButton onClick={() => openTeacherView("monitoring")} icon={<Monitor size={18} />}>
            모니터링 열기
          </SecondaryButton>
          <GhostButton onClick={resetDemo}>수업 초기화</GhostButton>
        </div>
      </div>
      <div className="grid gap-4">
        <InfoPanel title="학생 안내 정보" icon={<ClipboardList size={20} />}>
          <dl className="grid gap-3 text-sm">
            <InfoRow label="학생 입장 링크" value={studentLink || "?role=student"} />
            <InfoRow label="학생 접속 코드" value={session.accessCode} />
            <InfoRow label="수업 주제" value={session.topic} />
            <InfoRow label="AI 역할" value="질문 진행, 안전 판단, 프롬프트 생성, 교사용 분석" />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={() => void copyText(studentLink)} icon={<KeyRound size={18} />}>
              학생 링크 복사
            </SecondaryButton>
            <SecondaryButton type="button" onClick={openStudentPreview} icon={<LogIn size={18} />}>
              학생 화면 미리보기
            </SecondaryButton>
          </div>
        </InfoPanel>
      </div>
    </section>
  );
}

function StudentLoginView({ session, students, onEnter }: { session: SessionConfig; students: StudentWorkspace[]; onEnter: (student: StudentWorkspace) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(session.accessCode);
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (normalizedCode !== session.accessCode.toUpperCase()) {
      setError("접속 코드가 맞지 않아요. 선생님이 알려준 코드를 다시 확인해줘.");
      return;
    }

    if (!trimmedName) {
      setError("이름을 입력해줘.");
      return;
    }

    const existing = students.find((student) => student.name === trimmedName && student.accessCode === normalizedCode);
    const now = new Date().toISOString();
    const student: StudentWorkspace =
      existing ??
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        accessCode: normalizedCode,
        currentStage: "orient",
        lastActiveAt: now,
        messages: [createAssistantMessage(getInitialAssistantMessage(session), "orient")],
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
        <p className="mt-2 font-semibold leading-7 text-muted">선생님이 알려준 접속 코드와 이름을 입력하면 시작합니다. 이미 진행 중이었다면 새로고침 뒤에도 이어서 할 수 있어요.</p>
        <div className="mt-6 grid gap-4">
          <TextField label="이름" value={name} onChange={setName} placeholder="예: 김하늘" />
          <TextField label="접속 코드" value={code} onChange={(value) => setCode(value.toUpperCase())} placeholder="예: HITL35" />
        </div>
        {error && <p className="mt-4 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
        <PrimaryButton type="submit" className="mt-6 w-full justify-center" icon={<LogIn size={18} />}>
          채팅 시작
        </PrimaryButton>
      </form>
    </section>
  );
}

function StudentChatView({ session, student, onChange, onReset }: { session: SessionConfig; student: StudentWorkspace; onChange: (student: StudentWorkspace) => void; onReset: () => void }) {
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
      reason: "붙여넣기 시도가 감지되었습니다.",
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
          loopCount: latestPrompt?.loopCount ?? 0
        })
      });

      const result = await response.json();
      const now = new Date().toISOString();
      const nextMessages: ChatMessage[] = [...student.messages];
      if (result.userMessage) nextMessages.push(result.userMessage);

      if (result.blocked) {
        const alert: SafetyAlert = {
          id: crypto.randomUUID(),
          alertType: result.alertType,
          attemptedContent: trimmed,
          reason: result.reason,
          isRead: false,
          createdAt: now
        };
        nextMessages.push(createAssistantMessage(result.message, student.currentStage));
        onChange({
          ...student,
          messages: nextMessages,
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
          source: result.promptSource ?? "ai_assisted",
          createdAt: now
        });
      }

      if (result.isFinal && prompts.length > 0) {
        prompts[prompts.length - 1] = { ...prompts[prompts.length - 1], isFinal: true };
      }

      nextMessages.push(result.assistantMessage);
      onChange({
        ...student,
        currentStage: result.stage,
        messages: nextMessages,
        prompts,
        aiLogs: result.aiLog ? [...student.aiLogs, result.aiLog as AiAssistLog] : student.aiLogs,
        lastActiveAt: now
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="page-band grid h-[calc(100vh-73px)] min-h-0 gap-4 overflow-hidden py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-h-0 flex-col rounded-[8px] border border-line bg-white shadow-soft">
        <div className="shrink-0 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-primary">{session.topic}</p>
              <h1 className="text-2xl font-black text-ink">{student.name}의 프롬프트 대화</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-black text-secondary">{STAGES[Math.max(stageIndex, 0)]?.label ?? "진행 중"}</span>
              <SecondaryButton type="button" onClick={onReset} icon={<RotateCcw size={16} />}>
                처음부터 진행
              </SecondaryButton>
            </div>
          </div>
          <StageProgress currentStage={student.currentStage} />
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
          className="shrink-0 border-t border-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            className="focus-ring h-20 w-full resize-none rounded-[8px] border border-line bg-surface p-3 font-semibold leading-7 text-ink"
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
                  <SecondaryButton type="button" onClick={() => void sendMessage("조금 더 구체적으로 바꿔줘")}>
                    더 구체적으로
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => void sendMessage("이걸로 확정할래요")}>
                    이걸로 확정
                  </SecondaryButton>
                </>
              )}
            </div>
            <PrimaryButton type="submit" disabled={isSending || student.currentStage === "final"}>{student.currentStage === "final" ? "완료" : "보내기"}</PrimaryButton>
          </div>
        </form>
      </div>
      <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <InfoPanel title="현재 결과물" icon={<Check size={20} />}>
          {latestPrompt ? (
            <PromptCopyBox prompt={finalPrompt ?? latestPrompt} finalLabel={Boolean(finalPrompt)} />
          ) : (
            <p className="text-sm font-semibold leading-6 text-muted">학생 답변이 충분히 모이면 이미지 생성 프롬프트가 여기에 표시됩니다.</p>
          )}
        </InfoPanel>
        <InfoPanel title="진행 안내" icon={<Sparkles size={20} />}>
          <p className="text-sm font-semibold leading-6 text-muted">챗봇은 선생님이 설정한 질문을 바탕으로 대화를 이어가고, 최종 프롬프트는 학생 답변에 근거해 만듭니다.</p>
        </InfoPanel>
      </aside>
    </section>
  );
}

function TeacherAuthView({ onUnlock }: { onUnlock: (pin: string) => boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!onUnlock(pin)) {
      setError("교사용 PIN이 맞지 않습니다.");
      setPin("");
    }
  }

  return (
    <section className="page-band grid min-h-[calc(100vh-72px)] place-items-center py-10">
      <form className="w-full max-w-[520px] rounded-[8px] border border-line bg-white p-6 shadow-soft" onSubmit={submit}>
        <span className="grid h-12 w-12 place-items-center rounded-[8px] bg-secondarySoft text-secondary">
          <UserRound size={24} />
        </span>
        <h1 className="mt-5 text-3xl font-black text-ink">교사 입장</h1>
        <p className="mt-2 font-semibold leading-7 text-muted">수업 설정과 모니터링은 교사용 PIN을 입력해야 열 수 있습니다. 새로고침 후에도 이 상태는 유지됩니다.</p>
        <div className="mt-6">
          <TextField label="교사용 PIN" value={pin} onChange={setPin} placeholder="교사용 PIN 입력" />
        </div>
        {error && <p className="mt-4 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
        <PrimaryButton type="submit" className="mt-6 w-full justify-center" icon={<LogIn size={18} />}>
          교사 콘솔 열기
        </PrimaryButton>
      </form>
    </section>
  );
}

function TeacherSettingsView({ session, onSave, setView }: { session: SessionConfig; onSave: (session: SessionConfig) => void; setView: (view: View) => void }) {
  const [draft, setDraft] = useState(session);
  const [requiredText, setRequiredText] = useState(session.requiredElements.join(", "));
  const [constraintsText, setConstraintsText] = useState(session.constraints.join(", "));
  const [isDesigning, setIsDesigning] = useState(false);
  const [designStatus, setDesignStatus] = useState("");
  const hasLessonDesign = draft.questionFlow.length > 0;

  function currentDraft() {
    return {
      ...draft,
      title: draft.topic,
      learningGoal: DEFAULT_SESSION.learningGoal,
      maxLoopCount: DEFAULT_SESSION.maxLoopCount,
      aiEnabled: true,
      requiredElements: splitList(requiredText),
      constraints: splitList(constraintsText)
    };
  }

  function save() {
    if (!currentDraft().topic.trim()) {
      setDesignStatus("수업 주제를 먼저 입력해 주세요.");
      return;
    }
    if (draft.questionFlow.length === 0) {
      setDesignStatus("AI로 수업 설계를 눌러 질문 단계를 먼저 만들어 주세요.");
      return;
    }
    onSave(currentDraft());
    setView("monitoring");
  }

  async function designQuestions(mode: "generate" | "refine") {
    setIsDesigning(true);
    setDesignStatus(mode === "generate" ? "수업 주제에 맞는 질문 단계와 필수 요소를 설계하고 있습니다." : "현재 수업 설계를 다듬고 있습니다.");
    try {
      const response = await fetch("/api/lesson-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: currentDraft(), mode })
      });
      const result = await response.json();
      if (!response.ok) {
        setDesignStatus(`AI API 호출 실패: ${result.error ?? "Vercel 환경변수와 Gemini 키를 확인해 주세요."}`);
        return;
      }
      if (Array.isArray(result.questionFlow) && result.questionFlow.length > 0) {
        setDraft((current) => ({ ...current, questionFlow: result.questionFlow }));
        if (Array.isArray(result.requiredElements)) setRequiredText(result.requiredElements.join(", "));
        if (Array.isArray(result.constraints)) setConstraintsText(result.constraints.join(", "));
        setDesignStatus(result.aiUsed ? "Gemini API로 수업설계를 반영했습니다." : "수업설계가 반영되었습니다.");
      } else {
        setDesignStatus("수업설계 결과를 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      }
    } catch {
      setDesignStatus("수업설계 요청 중 오류가 났습니다. 네트워크나 환경변수를 확인해 주세요.");
    } finally {
      setIsDesigning(false);
    }
  }

  function updateQuestion(stage: Stage, question: string) {
    setDraft((current) => ({
      ...current,
      questionFlow: current.questionFlow.map((item) => (item.stage === stage ? { ...item, question } : item))
    }));
  }

  function deleteQuestion(stage: Stage) {
    setDraft((current) => ({ ...current, questionFlow: current.questionFlow.filter((item) => item.stage !== stage) }));
  }

  function addQuestion() {
    const missing = STAGES.find((stage) => !draft.questionFlow.some((item) => item.stage === stage.stage));
    if (!missing) {
      setDesignStatus("이미 모든 질문 단계가 들어 있습니다.");
      return;
    }
    setDraft((current) => ({
      ...current,
      questionFlow: [...current.questionFlow, { ...missing, question: "학생의 답변을 바탕으로 다음 생각을 물어보는 질문을 입력하세요." }]
    }));
    setDesignStatus(`${missing.label} 단계를 추가했습니다.`);
  }

  return (
    <section className="page-band grid gap-5 py-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-[8px] border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-primary">교사 설정</p>
            <h1 className="text-3xl font-black text-ink">수업 주제와 질문 흐름</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={() => void designQuestions("generate")} disabled={isDesigning || !draft.topic.trim()} icon={isDesigning ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}>
              AI로 수업 설계
            </SecondaryButton>
            <PrimaryButton onClick={save} icon={<Save size={18} />}>
              저장하고 모니터링
            </PrimaryButton>
          </div>
        </div>
        {designStatus && <p className="mt-4 rounded-[8px] bg-primarySoft px-3 py-2 text-sm font-bold text-primary">{designStatus}</p>}
        <div className="mt-6 grid gap-5">
          <TextField label="수업 주제" value={draft.topic} onChange={(value) => setDraft({ ...draft, topic: value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="학생 접속 코드" value={draft.accessCode} onChange={(value) => setDraft({ ...draft, accessCode: value.toUpperCase() })} />
            <TextField label="최종 산출물 유형" value={draft.outputType} onChange={(value) => setDraft({ ...draft, outputType: value })} />
          </div>
          {!hasLessonDesign ? (
            <div className="rounded-[8px] border border-dashed border-primary/35 bg-primarySoft/70 p-5 text-sm font-bold leading-7 text-primary">
              수업 주제를 입력한 뒤 AI로 수업 설계를 누르면 필수 포함 요소, 금지/주의 요소, 질문 단계 예시가 생성됩니다.
            </div>
          ) : (
            <>
              <TextArea label="필수 포함 요소" value={requiredText} onChange={setRequiredText} placeholder="쉼표로 구분: 장소, 주요 대상, 문제 해결 방법" />
              <TextArea label="금지/주의 요소" value={constraintsText} onChange={setConstraintsText} placeholder="쉼표로 구분: 주제 이탈 금지, 혐오 표현 금지" />
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-black text-ink">질문 단계</h2>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton type="button" onClick={addQuestion} icon={<Plus size={16} />}>
                      단계 추가
                    </SecondaryButton>
                  </div>
                </div>
                <div className="mt-3 grid gap-3">
                  {draft.questionFlow.map((item, index) => (
                    <div key={item.stage} className="grid gap-2 rounded-[8px] border border-line bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-muted">
                          {index + 1}. {item.label}
                        </span>
                        <button type="button" className="text-danger" onClick={() => deleteQuestion(item.stage)} title="질문 삭제">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <input className="focus-ring rounded-[8px] border border-line bg-white px-3 py-3 font-semibold text-ink" value={item.question} onChange={(event) => updateQuestion(item.stage, event.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <aside className="space-y-4">
        <InfoPanel title="AI 활용 범위" icon={<Sparkles size={20} />}>
          <p className="text-sm font-semibold leading-6 text-muted">AI는 수업 질문 설계, 학생 챗봇 진행, 안전 판단, 프롬프트 생성, 교사용 분석에 사용됩니다. 학생의 답변 아이디어를 대신 작성하지 않습니다.</p>
        </InfoPanel>
        <InfoPanel title="수업 운영 안내" icon={<ShieldCheck size={20} />}>
          <ul className="space-y-2 text-sm font-semibold leading-6 text-muted">
            <li>학생에게는 학생 입장 링크와 접속 코드만 안내합니다.</li>
            <li>교사용 PIN은 학생에게 공유하지 않습니다.</li>
            <li>최종 프롬프트는 학생이 승인한 뒤 결과물로 표시됩니다.</li>
          </ul>
        </InfoPanel>
      </aside>
    </section>
  );
}

function MonitoringView({
  session,
  students,
  setView,
  openTeacherView,
  onUpdateStudent,
  onDeleteStudent,
  onClearStudents
}: {
  session: SessionConfig;
  students: StudentWorkspace[];
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  onUpdateStudent: (student: StudentWorkspace) => void;
  onDeleteStudent: (studentId: string) => void;
  onClearStudents: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const stats = useMemo(() => {
    const finalCount = students.filter((student) => student.prompts.some((prompt) => prompt.isFinal)).length;
    const alertCount = students.reduce((sum, student) => sum + student.safetyAlerts.length, 0);
    const analysisCount = students.filter((student) => student.analysis).length;
    return { finalCount, alertCount, analysisCount };
  }, [students]);

  function downloadCsv() {
    const header = ["student_name", "current_stage", "last_active_at", "loop_count", "final_prompt", "alert_count", "analysis_summary"];
    const rows = students.map((student) => {
      const latest = student.prompts.at(-1);
      const final = student.prompts.find((prompt) => prompt.isFinal);
      return [student.name, student.currentStage, student.lastActiveAt, latest?.loopCount ?? 0, final?.content ?? latest?.content ?? "", student.safetyAlerts.length, student.analysis?.summary ?? ""];
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

  async function analyzeStudent(student: StudentWorkspace) {
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, student })
      });
      const result = await response.json();
      onUpdateStudent({ ...student, analysis: result.analysis as StudentAnalysis });
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="page-band py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-primary">{session.title}</p>
          <h1 className="text-3xl font-black text-ink">교사 모니터링</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => openTeacherView("teacher-settings")} icon={<Settings size={18} />}>
            설정 수정
          </SecondaryButton>
          <SecondaryButton onClick={onClearStudents} icon={<Trash2 size={18} />}>
            전체 학생 데이터 삭제
          </SecondaryButton>
          <PrimaryButton onClick={downloadCsv} icon={<Download size={18} />}>
            CSV 내보내기
          </PrimaryButton>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <StatCard icon={<UserRound size={20} />} label="참여 학생" value={`${students.length}명`} />
        <StatCard icon={<Check size={20} />} label="최종 완료" value={`${stats.finalCount}명`} />
        <StatCard icon={<Sparkles size={20} />} label="분석 완료" value={`${stats.analysisCount}명`} />
        <StatCard icon={<AlertTriangle size={20} />} label="안전 경고" value={`${stats.alertCount}건`} />
      </div>
      <div className="mt-5 overflow-hidden rounded-[8px] border border-line bg-white shadow-soft">
        <div className="grid grid-cols-[1.1fr_1fr_0.8fr_0.8fr_1.4fr_0.5fr] gap-3 border-b border-line bg-surface px-4 py-3 text-sm font-black text-muted max-lg:hidden">
          <span>학생</span>
          <span>현재 단계</span>
          <span>수정</span>
          <span>경고</span>
          <span>최종 결과물</span>
          <span>삭제</span>
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
              <button
                type="button"
                key={student.id}
                className="grid w-full gap-3 border-b border-line px-4 py-4 text-left text-sm font-semibold text-ink transition hover:bg-primarySoft/50 last:border-b-0 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_1.4fr_0.5fr]"
                onClick={() => setSelectedStudentId(student.id)}
              >
                <span>
                  <strong className="block text-base">{student.name}</strong>
                  <span className="text-muted">{formatTime(student.lastActiveAt)}</span>
                </span>
                <span>{stageLabel(student.currentStage)}</span>
                <span>{latest?.loopCount ?? 0}회</span>
                <span className={student.safetyAlerts.length > 0 ? "text-danger" : "text-muted"}>{student.safetyAlerts.length}건</span>
                <span className="truncate">{final ? final.content : latest ? `초안 v${latest.version}` : "대화 중"}</span>
                <span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="inline-flex text-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteStudent(student.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onDeleteStudent(student.id);
                    }}
                  >
                    <Trash2 size={18} />
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      {selectedStudent && (
        <StudentDetailModal
          session={session}
          student={selectedStudent}
          isAnalyzing={isAnalyzing}
          onClose={() => setSelectedStudentId(null)}
          onAnalyze={() => void analyzeStudent(selectedStudent)}
        />
      )}
    </section>
  );
}

function StudentDetailModal({ session, student, isAnalyzing, onClose, onAnalyze }: { session: SessionConfig; student: StudentWorkspace; isAnalyzing: boolean; onClose: () => void; onAnalyze: () => void }) {
  const latest = student.prompts.at(-1);
  const final = student.prompts.find((prompt) => prompt.isFinal);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[8px] bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-sm font-black text-primary">{session.topic}</p>
            <h2 className="text-2xl font-black text-ink">{student.name} 대화 기록</h2>
          </div>
          <button className="rounded-[8px] p-2 text-muted hover:bg-surface" onClick={onClose} title="닫기">
            <X size={20} />
          </button>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <InfoPanel title="전체 대화" icon={<ClipboardList size={20} />}>
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {student.messages.map((message) => (
                  <div key={message.id} className={`rounded-[8px] p-3 ${message.role === "user" ? "bg-primarySoft" : "bg-surface"}`}>
                    <p className="text-xs font-black text-muted">
                      {message.role === "user" ? "학생" : "챗봇"} · {stageLabel(message.stage)} · {formatTime(message.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{message.content}</p>
                  </div>
                ))}
              </div>
            </InfoPanel>
            <InfoPanel title="경고 기록" icon={<AlertTriangle size={20} />}>
              {student.safetyAlerts.length > 0 ? (
                <div className="space-y-2">
                  {student.safetyAlerts.map((alert) => (
                    <div key={alert.id} className="rounded-[8px] bg-dangerSoft p-3 text-sm font-semibold leading-6 text-danger">
                      <p className="font-black">{alertLabel(alert.alertType)} · {formatTime(alert.createdAt)}</p>
                      <p>입력: {alert.attemptedContent}</p>
                      {alert.reason && <p>판단 사유: {alert.reason}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold text-muted">경고 기록이 없습니다.</p>
              )}
            </InfoPanel>
          </div>
          <aside className="space-y-4">
            <InfoPanel title="최종 결과물" icon={<Copy size={20} />}>
              {latest ? <PromptCopyBox prompt={final ?? latest} finalLabel={Boolean(final)} /> : <p className="text-sm font-semibold text-muted">아직 프롬프트가 없습니다.</p>}
            </InfoPanel>
            <InfoPanel title="AI 분석" icon={<Sparkles size={20} />}>
              <PrimaryButton className="w-full justify-center" onClick={onAnalyze} disabled={isAnalyzing} icon={isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}>
                AI 분석하기
              </PrimaryButton>
              {student.analysis && (
                <div className="mt-4 space-y-3 text-sm font-semibold leading-6 text-ink">
                  <p className="rounded-[8px] bg-surface p-3">{student.analysis.summary}</p>
                  <AnalysisList title="개념 인식" items={[student.analysis.conceptUnderstanding]} />
                  <AnalysisList title="강점" items={student.analysis.strengths} />
                  <AnalysisList title="오해/부족한 점" items={student.analysis.misconceptions} />
                  <AnalysisList title="교사 추천 지도" items={student.analysis.teacherRecommendations} />
                  <AnalysisList title="다음 질문" items={student.analysis.nextQuestions} />
                </div>
              )}
            </InfoPanel>
          </aside>
        </div>
      </section>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="font-black text-muted">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PromptCopyBox({ prompt, finalLabel }: { prompt: PromptRecord; finalLabel: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await copyText(prompt.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button type="button" className="w-full rounded-[8px] bg-surface p-3 text-left transition hover:bg-primarySoft" onClick={() => void copyPrompt()} title="클릭해서 복사">
      <p className="mb-2 flex items-center justify-between gap-2 text-xs font-black text-muted">
        <span>{finalLabel ? "최종 승인 완료" : `초안 v${prompt.version}`} · {sourceLabel(prompt.source)}</span>
        <span className="inline-flex items-center gap-1 text-primary">
          <Copy size={14} /> {copied ? "복사됨" : "클릭 복사"}
        </span>
      </p>
      <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{prompt.content}</p>
    </button>
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
      <div className={`max-w-[78%] whitespace-pre-wrap rounded-[8px] px-4 py-3 text-sm font-semibold leading-7 ${isUser ? "bg-primary text-white" : "bg-surface text-ink"}`}>{message.content}</div>
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

function NavButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`rounded-[8px] px-3 py-2 text-sm font-bold transition ${active ? "bg-primary text-white" : "bg-white text-muted hover:bg-primarySoft hover:text-primary"}`} onClick={onClick}>
      {children}
    </button>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <textarea className="focus-ring min-h-24 rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold leading-7 text-ink" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input type="number" min={min} max={max} className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function PrimaryButton({ children, icon, className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  return (
    <button type={type} className={`inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#005a2d] disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

function SecondaryButton({ children, icon, className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
  return (
    <button type={type} className={`inline-flex items-center gap-2 rounded-[8px] border border-primary/25 bg-primarySoft px-4 py-3 text-sm font-black text-primary transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>
      {icon}
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", type = "button", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`rounded-[8px] px-4 py-3 text-sm font-black text-muted transition hover:bg-white hover:text-ink ${className}`} {...props}>
      {children}
    </button>
  );
}

function createAssistantMessage(content: string, stage: Stage): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    stage,
    createdAt: new Date().toISOString()
  };
}

async function copyText(value: string) {
  if (!value) return;
  await navigator.clipboard?.writeText(value);
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
  if (source === "ai_assisted") return "AI 생성";
  if (source === "student_revision") return "학생 수정";
  return "규칙 기반";
}

function alertLabel(alertType: SafetyAlert["alertType"]) {
  if (alertType === "paste_attempt") return "붙여넣기";
  if (alertType === "profanity") return "부적절 표현";
  if (alertType === "off_topic") return "주제 이탈";
  return "무의미 입력";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
