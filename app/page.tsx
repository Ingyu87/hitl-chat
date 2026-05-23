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
  LogOut,
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
import type { User } from "@supabase/supabase-js";
import { DEFAULT_SESSION, STAGES } from "@/lib/defaults";
import { getInitialAssistantMessage } from "@/lib/flow";
import { buildDefaultQuestionFlow, getChoicesForStage, getQuestionIndex, getQuestionFlow, injectTopic, MAX_QUESTION_COUNT } from "@/lib/question-flow";
import { clearStudentRows, deleteStudentRow, getCurrentTeacher, loadStudentsForSession, loadTeacherData, saveTeacherSession, signInTeacher, signOutTeacher, signUpTeacher } from "@/lib/supabase-db";
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
  pendingTeacherView: "home" | TeacherView;
  activeStudentId: string | null;
};

const DATA_STORAGE_KEY = "hitl-chat-state-v2";
const UI_STORAGE_KEY = "hitl-chat-ui-v2";
const APP_NAME = "생각잇기 프롬프트";
const APP_SUBTITLE = "학생 답변 기반 이미지 생성 프롬프트 수업 도구";

const initialData: AppData = {
  session: DEFAULT_SESSION,
  students: []
};

const initialUi: UiState = {
  view: "teacher-auth",
  isTeacherUnlocked: false,
  isTeacherStudentPreview: false,
  pendingTeacherView: "home",
  activeStudentId: null
};

export default function AppPage() {
  const [data, setData] = useState<AppData>(initialData);
  const [ui, setUi] = useState<UiState>(initialUi);
  const [isLoaded, setIsLoaded] = useState(false);
  const [teacherUser, setTeacherUser] = useState<User | null>(null);
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

      const user = await getCurrentTeacher();
      if (user) {
        setTeacherUser(user);
        nextData = await loadTeacherData(user);
        nextUi = { ...nextUi, isTeacherUnlocked: true, view: nextUi.view === "teacher-auth" ? "home" : nextUi.view };
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
          view: nextUi.isTeacherUnlocked ? "home" : "teacher-auth",
          isTeacherStudentPreview: false,
          activeStudentId: null
        };
      } else if (!nextUi.isTeacherUnlocked) {
        nextUi = {
          ...nextUi,
          view: "teacher-auth",
          pendingTeacherView: "home",
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
    return;
  }, [data, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !teacherUser) return;

    const pollTimer = window.setInterval(async () => {
      const students = await loadStudentsForSession(data.session.id);
      setData((current) => ({ ...current, students }));
    }, 3000);

    return () => window.clearInterval(pollTimer);
  }, [data.session.id, isLoaded, teacherUser]);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui));
  }, [ui, isLoaded]);

  function setView(view: View) {
    if (!teacherUser && view !== "student-login" && view !== "student-chat" && view !== "teacher-auth") {
      setUi((current) => ({ ...current, view: "teacher-auth", isTeacherStudentPreview: false, activeStudentId: null }));
      return;
    }

    setUi((current) => ({ ...current, view, isTeacherStudentPreview: view === "student-login" || view === "student-chat" ? current.isTeacherStudentPreview : false }));
  }

  function updateSession(session: SessionConfig) {
    setData((current) => {
      const now = new Date().toISOString();
      const previousRevision = current.session.revision ?? 1;
      const nextSession = {
        ...session,
        revision: previousRevision + 1,
        updatedAt: now
      };

      if (teacherUser) {
        void saveTeacherSession(nextSession, teacherUser).then((savedSession) => {
          setData((latest) => ({ ...latest, session: savedSession }));
        });
      }

      return {
        session: {
          ...nextSession
        },
        students: current.students
      };
    });
  }

  function upsertStudent(student: StudentWorkspace) {
    if (student.sessionId) {
      void fetch("/api/student/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student })
      });
    }

    setData((current) => ({
      ...current,
      students: current.students.some((item) => item.id === student.id)
        ? current.students.map((item) => (item.id === student.id ? student : item))
        : [...current.students, student]
    }));
  }

  function resetStudent(studentId: string) {
    const now = new Date().toISOString();
    let nextStudent: StudentWorkspace | null = null;
    setData((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? (nextStudent = {
              ...student,
              currentStage: "orient",
              joinedRevision: current.session.revision ?? 1,
              lastActiveAt: now,
              messages: [createAssistantMessage(getInitialAssistantMessage(current.session), "orient")],
              prompts: [],
              safetyAlerts: [],
              aiLogs: [],
              analysis: undefined
            })
          : student
      )
    }));
    window.setTimeout(() => {
      if (nextStudent) upsertStudent(nextStudent);
    }, 0);
  }

  function deleteStudent(studentId: string) {
    void deleteStudentRow(studentId);
    setData((current) => ({ ...current, students: current.students.filter((student) => student.id !== studentId) }));
    setUi((current) => ({ ...current, activeStudentId: current.activeStudentId === studentId ? null : current.activeStudentId }));
  }

  function clearStudents() {
    void clearStudentRows(data.session.id);
    setData((current) => ({ ...current, students: [] }));
    setUi((current) => ({ ...current, activeStudentId: null }));
  }

  function resetDemo() {
    setData(initialData);
    setUi(initialUi);
  }

  function openTeacherView(target: TeacherView) {
    if (teacherUser) {
      setUi((current) => ({ ...current, view: target, isTeacherStudentPreview: false }));
      return;
    }

    setUi((current) => ({ ...current, pendingTeacherView: target, view: "teacher-auth", isTeacherStudentPreview: false }));
  }

  async function unlockTeacher(email: string, password: string, mode: "sign-in" | "sign-up") {
    const user = mode === "sign-up" ? await signUpTeacher(email, password) : await signInTeacher(email, password);
    if (mode === "sign-up" && !user) return "needs-email-confirmation";
    if (!user) return false;
    const nextData = migrateSavedData(await loadTeacherData(user));
    setTeacherUser(user);
    setData(nextData);
    setUi((current) => ({ ...current, isTeacherUnlocked: true, view: current.pendingTeacherView, isTeacherStudentPreview: false }));
    return "signed-in";
  }

  async function logoutTeacher() {
    await signOutTeacher();
    setTeacherUser(null);
    setUi((current) => ({ ...current, isTeacherUnlocked: false, pendingTeacherView: "home", view: "teacher-auth", activeStudentId: null, isTeacherStudentPreview: false }));
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
      <TopBar view={ui.view} setView={setView} openTeacherView={openTeacherView} openStudentPreview={openStudentPreview} isTeacherStudentPreview={ui.isTeacherStudentPreview} teacherUser={teacherUser} onLogout={() => void logoutTeacher()} />
      {ui.view === "home" && (
        <HomeView
          session={data.session}
          setView={setView}
          openTeacherView={openTeacherView}
          openStudentPreview={openStudentPreview}
          resetDemo={resetDemo}
          isTeacherAuthenticated={Boolean(teacherUser)}
        />
      )}
      {ui.view === "student-login" && (
        <StudentLoginView
          session={data.session}
          students={data.students}
          onEnter={(student, session) => {
            if (session) setData((current) => ({ ...current, session }));
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
          onUpdateSession={updateSession}
          onUpdateStudent={upsertStudent}
          onDeleteStudent={deleteStudent}
          onClearStudents={clearStudents}
        />
      )}
    </main>
  );
}

function migrateSavedData(data: AppData): AppData {
  const session = {
    ...DEFAULT_SESSION,
    ...data.session,
    requiredElements: data.session.requiredElements ?? [],
    constraints: data.session.constraints ?? [],
    questionFlow: data.session.questionFlow ?? [],
    revision: data.session.revision ?? 1,
    updatedAt: data.session.updatedAt ?? new Date(0).toISOString()
  };
  const hasMatchingQuestionFlow = questionFlowMatchesTopic(session);

  return {
    ...data,
    session: {
      ...session,
      questionFlow: hasMatchingQuestionFlow ? session.questionFlow : [],
      lessonDesigned: Boolean(session.lessonDesigned && session.questionFlow.length > 0 && hasMatchingQuestionFlow),
      isActive: Boolean(session.isActive && session.lessonDesigned && hasMatchingQuestionFlow)
    },
    students: data.students ?? []
  };
}

function questionFlowMatchesTopic(session: SessionConfig) {
  return Boolean(session.questionFlow?.length);
}

function buildStudentLink(accessCode: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.origin);
  url.searchParams.set("role", "student");
  url.searchParams.set("code", accessCode);
  return url.toString();
}

function previewQuestion(question: string, session: SessionConfig) {
  return injectTopic(question, session);
}

function getTeacherUnlockCode(session: SessionConfig) {
  const seed = `${session.id || ""}${session.accessCode || ""}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9000;
  }
  return String(1000 + hash).padStart(4, "0");
}

function isLockingAlert(alertType: SafetyAlert["alertType"]) {
  return ["paste_attempt", "profanity", "sexual", "abusive"].includes(alertType);
}

function getLastTeacherUnlockTime(student: StudentWorkspace) {
  return Math.max(
    0,
    ...student.messages
      .filter((message) => message.role === "system" && message.content === "TEACHER_UNLOCK")
      .map((message) => Date.parse(message.createdAt) || 0)
  );
}

function getActiveSafetyAlerts(student: StudentWorkspace) {
  const unlockedAt = getLastTeacherUnlockTime(student);
  return student.safetyAlerts.filter((alert) => isLockingAlert(alert.alertType) && (Date.parse(alert.createdAt) || 0) > unlockedAt);
}

function isStudentLocked(student: StudentWorkspace) {
  return getActiveSafetyAlerts(student).length >= 3;
}

function parseTime(value?: string) {
  const time = value ? Date.parse(value) : 0;
  return Number.isNaN(time) ? 0 : time;
}

function mergeRemoteData(current: AppData, remote: AppData): AppData {
  const currentSessionTime = parseTime(current.session.updatedAt);
  const remoteSessionTime = parseTime(remote.session.updatedAt);
  const session = remoteSessionTime > currentSessionTime ? remote.session : current.session;
  const studentsById = new Map<string, StudentWorkspace>();

  for (const student of current.students) studentsById.set(student.id, student);
  for (const remoteStudent of remote.students) {
    const localStudent = studentsById.get(remoteStudent.id);
    if (!localStudent || parseTime(remoteStudent.lastActiveAt) >= parseTime(localStudent.lastActiveAt)) {
      studentsById.set(remoteStudent.id, remoteStudent);
    }
  }

  return { session, students: Array.from(studentsById.values()) };
}

function buildLocalAnalysisFallback(student: StudentWorkspace): StudentAnalysis {
  const latest = student.prompts.at(-1);
  const final = student.prompts.find((prompt) => prompt.isFinal);

  return {
    summary: final || latest ? "AI 분석을 생성하지 못했습니다. 최신 프롬프트와 대화 기록을 직접 확인해 주세요." : "아직 분석할 최종 프롬프트가 없습니다.",
    conceptUnderstanding: "확인 필요",
    strengths: student.messages.some((message) => message.role === "user") ? ["수업 대화에 참여했습니다."] : [],
    misconceptions: student.safetyAlerts.length > 0 ? ["안전 또는 관련성 경고가 있어 교사 확인이 필요합니다."] : [],
    teacherRecommendations: ["학생 대화 기록과 최신 프롬프트를 비교해 누락된 시각 요소를 확인해 주세요."],
    nextQuestions: ["장면에서 가장 먼저 보여야 하는 대상은 무엇인가요?"],
    createdAt: new Date().toISOString()
  };
}

function TopBar({
  view,
  setView,
  openTeacherView,
  openStudentPreview,
  isTeacherStudentPreview,
  teacherUser,
  onLogout
}: {
  view: View;
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  openStudentPreview: () => void;
  isTeacherStudentPreview: boolean;
  teacherUser: User | null;
  onLogout: () => void;
}) {
  const isStudentView = view === "student-login" || view === "student-chat";
  const shouldHideTeacherNav = (isStudentView && !isTeacherStudentPreview) || (view === "teacher-auth" && !teacherUser);

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-white/86 backdrop-blur">
      <div className="page-band flex min-h-16 items-center justify-between gap-4 py-3">
        <button type="button" className="flex items-center gap-3 text-left" onClick={() => setView(isStudentView && !isTeacherStudentPreview ? "student-login" : teacherUser ? "home" : "teacher-auth")} title="처음 화면">
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
              교사용 학생 미리보기
            </NavButton>
            {teacherUser && (
              <button type="button" className="inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-black text-muted hover:bg-surface" onClick={onLogout} title="로그아웃">
                <LogOut size={16} />
                <span>로그아웃</span>
              </button>
            )}
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
  resetDemo,
  isTeacherAuthenticated
}: {
  session: SessionConfig;
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  openStudentPreview: () => void;
  resetDemo: () => void;
  isTeacherAuthenticated: boolean;
}) {
  const studentLink = buildStudentLink(session.accessCode);
  const isStudentLinkReady = Boolean(session.lessonDesigned && session.isActive && session.questionFlow.length > 0);

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
        {isTeacherAuthenticated ? (
          <InfoPanel title="학생 안내 정보" icon={<ClipboardList size={20} />}>
            <dl className="grid gap-3 text-sm">
              <InfoRow label="학생 입장 링크" value={isStudentLinkReady ? studentLink : "질문 흐름 승인 후 생성됩니다"} />
              <InfoRow label="학생 접속 코드" value={session.accessCode} />
              <InfoRow label="수업 주제" value={session.topic} />
              <InfoRow label="AI 역할" value="질문 진행, 안전 판단, 프롬프트 생성, 교사용 분석" />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => void copyText(isStudentLinkReady ? studentLink : "")} disabled={!isStudentLinkReady} icon={<KeyRound size={18} />}>
                학생 링크 복사
              </SecondaryButton>
            </div>
          </InfoPanel>
        ) : (
          <InfoPanel title="교사 로그인 필요" icon={<ShieldCheck size={20} />}>
            <p className="text-sm font-semibold leading-6 text-muted">학생 입장 링크와 접속 코드는 교사 로그인 후 확인할 수 있습니다.</p>
            <PrimaryButton className="mt-4" onClick={() => openTeacherView("teacher-settings")} icon={<LogIn size={18} />}>
              교사 로그인
            </PrimaryButton>
          </InfoPanel>
        )}
      </div>
    </section>
  );
}

function StudentLoginView({ session, students, onEnter }: { session: SessionConfig; students: StudentWorkspace[]; onEnter: (student: StudentWorkspace, session?: SessionConfig) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(session.accessCode);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlCode = new URLSearchParams(window.location.search).get("code");
    setCode((current) => (urlCode || current || session.accessCode).toUpperCase());
  }, [session.accessCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("이름을 입력해주세요.");
      return;
    }

    const response = await fetch("/api/student/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizedCode, name: trimmedName })
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "수업에 입장할 수 없어요.");
      return;
    }

    onEnter(result.student as StudentWorkspace, result.session as SessionConfig);
    return;

    if (!session.isActive) {
      setError("수업이 아직 시작되지 않았어요. 선생님이 수업을 시작하면 다시 시도해 주세요.");
      return;
    }

    if (!session.lessonDesigned || session.questionFlow.length === 0) {
      setError("선생님이 AI 질문 초안을 승인한 뒤 입장할 수 있어요.");
      return;
    }

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
    const sessionRevision = session.revision ?? 1;
    const shouldResetExisting = Boolean(existing) && (existing as StudentWorkspace).joinedRevision !== sessionRevision;
    const student: StudentWorkspace =
      existing && !shouldResetExisting
        ? (existing as StudentWorkspace)
        :
      {
        id: existing?.id ?? crypto.randomUUID(),
        name: trimmedName,
        accessCode: normalizedCode,
        joinedRevision: sessionRevision,
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
  const [unlockCode, setUnlockCode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestPrompt = student.prompts.at(-1);
  const finalPrompt = student.prompts.find((prompt) => prompt.isFinal);
  const stageIndex = getQuestionIndex(session, student.currentStage);
  const activeSafetyAlerts = getActiveSafetyAlerts(student);
  const isLocked = activeSafetyAlerts.length >= 3;
  const currentChoices = getChoicesForStage(session, student.currentStage);
  const aiUsedCount = student.aiLogs.filter((log) => log.used).length;
  const aiLimit = Math.max(0, session.aiCallsPerStudentLimit ?? 0);
  const aiRemaining = Math.max(0, aiLimit - aiUsedCount);
  const aiCounterText = !session.aiEnabled
    ? "AI 보조 꺼짐"
    : aiRemaining <= 0
      ? "AI 보조 한도 도달 · 기본 질문으로 진행"
      : aiRemaining <= 5
        ? `AI 보조 ${aiUsedCount}/${aiLimit}회 · 남은 ${aiRemaining}회`
        : `AI 보조 ${aiUsedCount}/${aiLimit}회`;
  const aiCounterClassName = !session.aiEnabled
    ? "bg-surface text-muted"
    : aiRemaining <= 0
      ? "bg-dangerSoft text-danger"
      : aiRemaining <= 5
        ? "bg-amber-100 text-amber-800"
        : "bg-primarySoft text-primary";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [student.messages.length]);

  function addPasteAlert(content: string) {
    const now = new Date().toISOString();
    const alert: SafetyAlert = {
      id: crypto.randomUUID(),
      alertType: "paste_attempt",
      attemptedContent: content,
      reason: "붙여넣기 시도가 감지되었습니다.",
      isRead: false,
      createdAt: now
    };
    const nextAlerts = [...student.safetyAlerts, alert];
    const nextMessages = [...student.messages];
    if (getActiveSafetyAlerts({ ...student, safetyAlerts: nextAlerts }).length >= 3) {
      nextMessages.push(createAssistantMessage("문제 행동 경고가 3회 누적되어 활동이 잠겼습니다. 담임선생님께 보고하고, 선생님이 해제 코드를 입력해야 다시 진행할 수 있습니다.", student.currentStage));
    }
    onChange({ ...student, messages: nextMessages, safetyAlerts: nextAlerts, lastActiveAt: now });
  }

  function unlockStudent(event: FormEvent) {
    event.preventDefault();
    if (unlockCode.trim() !== getTeacherUnlockCode(session)) {
      setUnlockError("해제 코드가 맞지 않습니다. 선생님께 다시 확인해 주세요.");
      return;
    }

    const now = new Date().toISOString();
    setUnlockCode("");
    setUnlockError("");
    onChange({
      ...student,
      messages: [
        ...student.messages,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "TEACHER_UNLOCK",
          stage: student.currentStage,
          createdAt: now
        },
        createAssistantMessage("선생님 확인으로 잠금이 해제되었습니다. 이제 수업 주제에 맞게 다시 이어가 볼게요.", student.currentStage)
      ],
      lastActiveAt: now
    });
  }

  async function sendMessage(message = input) {
    const trimmed = message.trim();
    if (!trimmed || isSending || isLocked) return;

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
        const nextAlerts = [...student.safetyAlerts, alert];
        if (getActiveSafetyAlerts({ ...student, safetyAlerts: nextAlerts }).length >= 3) {
          nextMessages.push(createAssistantMessage("문제 행동 경고가 3회 누적되어 활동이 잠겼습니다. 담임선생님께 보고하고, 선생님이 해제 코드를 입력해야 다시 진행할 수 있습니다.", student.currentStage));
        }
        onChange({
          ...student,
          messages: nextMessages,
          safetyAlerts: nextAlerts,
          lastActiveAt: now
        });
        return;
      }

      const nextSafetyAlerts = [...student.safetyAlerts];
      if (result.warning) {
        nextSafetyAlerts.push({
          id: crypto.randomUUID(),
          alertType: result.warning.alertType,
          attemptedContent: trimmed,
          reason: result.warning.reason,
          isRead: false,
          createdAt: now
        });
        if (getActiveSafetyAlerts({ ...student, safetyAlerts: nextSafetyAlerts }).length >= 3) {
          nextMessages.push(createAssistantMessage("문제 행동 경고가 3회 누적되어 활동이 잠겼습니다. 담임선생님께 보고하고, 선생님이 해제 코드를 입력해야 다시 진행할 수 있습니다.", student.currentStage));
        }
      }

      if (result.clarification) {
        nextMessages.push(result.assistantMessage);
        onChange({
          ...student,
          messages: nextMessages,
          safetyAlerts: nextSafetyAlerts,
          aiLogs: result.aiLog ? [...student.aiLogs, result.aiLog as AiAssistLog] : student.aiLogs,
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
        safetyAlerts: nextSafetyAlerts,
        aiLogs: result.aiLog ? [...student.aiLogs, result.aiLog as AiAssistLog] : student.aiLogs,
        lastActiveAt: now
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="page-band grid h-[calc(100vh-73px)] min-h-0 gap-4 overflow-hidden py-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {isLocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
          <form className="w-full max-w-md rounded-[8px] border border-danger/30 bg-white p-5 shadow-soft" onSubmit={unlockStudent}>
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-dangerSoft text-danger">
                <ShieldCheck size={22} />
              </span>
              <div>
                <h2 className="text-xl font-black text-ink">안전 확인이 필요해요</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                  안전 확인이 필요한 입력이 3회 누적되었습니다. 선생님이 숫자 4자리 해제 코드를 입력하면 다시 진행할 수 있습니다.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">
              안전 경고 {activeSafetyAlerts.length}건
            </div>
            <TextField label="교사 해제 코드" value={unlockCode} onChange={setUnlockCode} placeholder="숫자 4자리" type="password" />
            {unlockError && <p className="mt-3 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{unlockError}</p>}
            <PrimaryButton type="submit" className="mt-4 w-full justify-center" icon={<ShieldCheck size={18} />}>
              잠금 해제
            </PrimaryButton>
          </form>
        </div>
      )}
      <div className="flex min-h-0 flex-col rounded-[8px] border border-line bg-white shadow-soft">
        <div className="shrink-0 border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-primary">{session.topic}</p>
              <h1 className="text-2xl font-black text-ink">{student.name}의 프롬프트 대화</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-black text-secondary">{getQuestionFlow(session)[Math.max(stageIndex, 0)]?.label ?? "진행 중"}</span>
              <SecondaryButton type="button" onClick={onReset} icon={<RotateCcw size={16} />}>
                처음부터 진행
              </SecondaryButton>
            </div>
          </div>
          <StageProgress session={session} currentStage={student.currentStage} />
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
          {currentChoices.length > 0 && student.currentStage !== "final" && !isLocked && (
            <div className="mb-3 flex flex-wrap gap-2">
              {currentChoices.map((choice) => (
                <button
                  key={`${choice.label}-${choice.value}`}
                  type="button"
                  className="focus-ring rounded-[8px] border border-line bg-white px-3 py-2 text-left text-sm font-black text-ink hover:border-primary hover:bg-primarySoft"
                  onClick={() => void sendMessage(choice.value)}
                  title={choice.description}
                  disabled={isSending}
                >
                  <span className="block">{choice.label}</span>
                  {choice.description && <span className="mt-1 block text-xs font-semibold leading-5 text-muted">{choice.description}</span>}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="focus-ring h-20 w-full resize-none rounded-[8px] border border-line bg-surface p-3 font-semibold leading-7 text-ink"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              addPasteAlert(event.clipboardData.getData("text"));
              event.preventDefault();
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
                addPasteAlert("keyboard paste");
                event.preventDefault();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
            placeholder={student.currentStage === "revise" ? "수정할 점을 쓰거나, 이걸로 확정할래요 라고 입력해줘." : "네 생각을 직접 적어줘."}
            disabled={student.currentStage === "final" || isLocked}
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
            <PrimaryButton type="submit" disabled={isSending || student.currentStage === "final" || isLocked}>{student.currentStage === "final" ? "완료" : "보내기"}</PrimaryButton>
          </div>
        </form>
      </div>
      <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <InfoPanel title="AI 보조 사용량" icon={<Sparkles size={20} />}>
          <p className={`rounded-[8px] px-3 py-2 text-sm font-black ${aiCounterClassName}`}>{aiCounterText}</p>
        </InfoPanel>
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

type TeacherAuthResult = "signed-in" | "needs-email-confirmation" | false;

function TeacherAuthView({ onUnlock }: { onUnlock: (email: string, password: string, mode: "sign-in" | "sign-up") => Promise<TeacherAuthResult> }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("올바른 교사 이메일을 입력해 주세요.");
      return;
    }
    if (pin.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    try {
      const result = await onUnlock(trimmedEmail, pin, mode);
      if (result === "needs-email-confirmation") {
        setNotice("회원가입 요청이 완료되었습니다. 이메일 인증 메일을 확인한 뒤 로그인해 주세요.");
        setMode("sign-in");
        setPin("");
        return;
      }
      if (!result) {
        setError(mode === "sign-up" ? "회원가입 정보를 확인해 주세요. 이미 가입한 이메일이면 로그인해 주세요." : "이메일 또는 비밀번호를 확인해주세요.");
        setPin("");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "로그인에 실패했습니다.");
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
        <p className="mt-2 font-semibold leading-7 text-muted">교사 이메일과 비밀번호로 로그인하면 수업 설정과 모니터링을 사용할 수 있습니다.</p>
        <div className="mt-6 grid gap-4">
          <TextField label="교사 이메일" value={email} onChange={setEmail} placeholder="teacher@example.com" />
          <TextField label="비밀번호" value={pin} onChange={setPin} placeholder="비밀번호 입력" type="password" />
        </div>
        {error && <p className="mt-4 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{error}</p>}
        {notice && <p className="mt-4 rounded-[8px] bg-primarySoft px-3 py-2 text-sm font-bold text-primary">{notice}</p>}
        <PrimaryButton type="submit" className="mt-6 w-full justify-center" icon={<LogIn size={18} />}>
          {mode === "sign-up" ? "회원가입하기" : "로그인하기"}
        </PrimaryButton>
        <button type="button" className="mt-4 w-full text-center text-sm font-black text-muted hover:text-primary" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
          {mode === "sign-in" ? "계정이 없으면 회원가입" : "이미 계정이 있으면 로그인"}
        </button>
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
  const hasLessonDesign = Boolean(draft.lessonDesigned && draft.questionFlow.length > 0);

  function currentDraft() {
    return {
      ...draft,
      title: draft.topic,
      requiredElements: splitList(requiredText),
      constraints: splitList(constraintsText),
      aiCallsPerStudentLimit: Math.min(30, Math.max(0, draft.aiCallsPerStudentLimit)),
      lessonDesigned: Boolean(draft.lessonDesigned && draft.questionFlow.length > 0)
    };
  }

  function save() {
    if (!currentDraft().topic.trim()) {
      setDesignStatus("수업 주제를 먼저 입력해 주세요.");
      return;
    }
    if (!hasLessonDesign) {
      setDesignStatus("AI로 수업 설계를 눌러 질문 단계를 먼저 만들어 주세요.");
      return;
    }
    onSave({ ...currentDraft(), lessonDesigned: true, isActive: true });
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
        const nextRequired = Array.isArray(result.requiredElements) ? result.requiredElements : splitList(requiredText);
        const nextConstraints = Array.isArray(result.constraints) ? result.constraints : splitList(constraintsText);
        const nextSession: SessionConfig = {
          ...currentDraft(),
          questionFlow: result.questionFlow,
          requiredElements: nextRequired,
          constraints: nextConstraints,
          aiEnabled: true,
          aiCallsPerStudentLimit: currentDraft().aiCallsPerStudentLimit,
          lessonDesigned: true,
          isActive: false
        };
        setDraft(nextSession);
        setRequiredText(nextRequired.join(", "));
        setConstraintsText(nextConstraints.join(", "));
        setDesignStatus(result.aiUsed ? "AI가 질문 초안을 만들었습니다. 교사가 수정, 순서 변경, 추가를 점검한 뒤 승인하면 학생 링크가 생성됩니다." : "기본 질문 초안을 만들었습니다. 교사가 점검한 뒤 승인하면 학생 링크가 생성됩니다.");
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

  function moveQuestion(stage: Stage, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.questionFlow.findIndex((item) => item.stage === stage);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.questionFlow.length) return current;
      const questionFlow = [...current.questionFlow];
      [questionFlow[index], questionFlow[nextIndex]] = [questionFlow[nextIndex], questionFlow[index]];
      return { ...current, questionFlow };
    });
  }

  function addQuestion() {
    if (draft.questionFlow.length >= MAX_QUESTION_COUNT) {
      setDesignStatus(`질문은 최대 ${MAX_QUESTION_COUNT}개까지 추가할 수 있습니다.`);
      return;
    }
    const nextNumber = draft.questionFlow.length + 1;
    const nextQuestion = {
      stage: `question-${nextNumber}`,
      label: `질문 ${nextNumber}`,
      question: "학생의 답변을 바탕으로 다음 생각을 물어보는 질문을 입력하세요.",
      choices: []
    };
    setDraft((current) => ({
      ...current,
      lessonDesigned: true,
      questionFlow: [...current.questionFlow, nextQuestion]
    }));
    setDesignStatus(`${nextQuestion.label}을 추가했습니다. 최대 ${MAX_QUESTION_COUNT}개까지 가능합니다.`);
  }

  function applyDefaultFlow() {
    const nextDraft = currentDraft();
    const nextSession: SessionConfig = {
      ...nextDraft,
      questionFlow: buildDefaultQuestionFlow(nextDraft),
      lessonDesigned: true,
      isActive: false
    };
    setDraft(nextSession);
    setDesignStatus("현재 주제를 반영한 기본 질문 흐름을 적용했습니다.");
  }

  function resetLesson() {
    const now = new Date().toISOString();
    const nextSession: SessionConfig = {
      ...DEFAULT_SESSION,
      id: crypto.randomUUID(),
      title: "",
      topic: "",
      questionFlow: [],
      lessonDesigned: false,
      isActive: false,
      aiEnabled: true,
      aiCallsPerStudentLimit: 30,
      accessCode: `HITL${Math.floor(1000 + Math.random() * 9000)}`,
      revision: (draft.revision ?? 1) + 1,
      updatedAt: now
    };
    setDraft(nextSession);
    setRequiredText("");
    setConstraintsText("");
    onSave(nextSession);
    setDesignStatus("수업을 초기화했습니다. 새 주제를 입력한 뒤 AI로 수업 설계를 다시 눌러 주세요.");
  }

  function updateTopic(value: string) {
    setDraft((current) => ({
      ...current,
      topic: value,
      lessonDesigned: false
    }));
    if (draft.questionFlow.length > 0) {
      setDesignStatus("주제가 바뀌었습니다. AI로 수업 설계하거나 기본 질문 흐름을 다시 적용해 주세요.");
    }
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
            <GhostButton type="button" onClick={resetLesson}>
              수업 초기화
            </GhostButton>
            <PrimaryButton onClick={save} icon={<Save size={18} />}>
              저장하고 모니터링
            </PrimaryButton>
          </div>
        </div>
        {designStatus && <p className="mt-4 rounded-[8px] bg-primarySoft px-3 py-2 text-sm font-bold text-primary">{designStatus}</p>}
        <div className="mt-6 grid gap-5">
          <TextField label="수업 주제" value={draft.topic} onChange={updateTopic} />
          <TextArea label="학습 목표" value={draft.learningGoal} onChange={(value) => setDraft({ ...draft, learningGoal: value })} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="학생 접속 코드" value={draft.accessCode} onChange={(value) => setDraft({ ...draft, accessCode: value.toUpperCase() })} />
            <TextField label="최종 산출물 유형" value={draft.outputType} onChange={(value) => setDraft({ ...draft, outputType: value })} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField label="최대 수정 횟수" value={draft.maxLoopCount} min={1} max={8} onChange={(value) => setDraft({ ...draft, maxLoopCount: value })} />
            <NumberField label="학생당 AI 보조 한도" value={draft.aiCallsPerStudentLimit} min={0} max={30} onChange={(value) => setDraft({ ...draft, aiCallsPerStudentLimit: value })} />
            <label className="flex items-center gap-3 rounded-[8px] border border-line bg-surface px-3 py-3 text-sm font-black text-muted">
              <input type="checkbox" checked={draft.aiEnabled} onChange={(event) => setDraft({ ...draft, aiEnabled: event.target.checked })} />
              AI 문장 보조 사용
            </label>
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
                  <h2 className="text-lg font-black text-ink">챗봇 대화 흐름</h2>
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
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-[8px] border border-line bg-white px-2 py-1 text-xs font-black text-muted disabled:opacity-40"
                            onClick={() => moveQuestion(item.stage, -1)}
                            disabled={index === 0}
                          >
                            위로
                          </button>
                          <button
                            type="button"
                            className="rounded-[8px] border border-line bg-white px-2 py-1 text-xs font-black text-muted disabled:opacity-40"
                            onClick={() => moveQuestion(item.stage, 1)}
                            disabled={index === draft.questionFlow.length - 1}
                          >
                            아래로
                          </button>
                          <button type="button" className="text-danger" onClick={() => deleteQuestion(item.stage)} title="질문 삭제">
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </div>
                      <input className="focus-ring rounded-[8px] border border-line bg-white px-3 py-3 font-semibold text-ink" value={item.question} onChange={(event) => updateQuestion(item.stage, event.target.value)} />
                      <p className="text-xs font-bold leading-5 text-muted">챗봇에게 전달되는 흐름 지시: {previewQuestion(item.question, currentDraft())}</p>
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
  onUpdateSession,
  onUpdateStudent,
  onDeleteStudent,
  onClearStudents
}: {
  session: SessionConfig;
  students: StudentWorkspace[];
  setView: (view: View) => void;
  openTeacherView: (view: TeacherView) => void;
  onUpdateSession: (session: SessionConfig) => void;
  onUpdateStudent: (student: StudentWorkspace) => void;
  onDeleteStudent: (studentId: string) => void;
  onClearStudents: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const studentLink = buildStudentLink(session.accessCode);
  const isStudentLinkReady = Boolean(session.lessonDesigned && session.isActive && session.questionFlow.length > 0);
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
      if (result.analysis) {
        onUpdateStudent({ ...student, analysis: result.analysis as StudentAnalysis });
      } else {
        onUpdateStudent({ ...student, analysis: buildLocalAnalysisFallback(student) });
      }
    } catch {
      onUpdateStudent({ ...student, analysis: buildLocalAnalysisFallback(student) });
    } finally {
      setIsAnalyzing(false);
    }
  }

  function toggleSessionActive() {
    if (!session.lessonDesigned || session.questionFlow.length === 0) {
      window.alert("AI 질문 초안을 승인한 뒤 수업을 시작할 수 있어요.");
      return;
    }
    onUpdateSession({ ...session, isActive: !session.isActive });
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
          <SecondaryButton onClick={toggleSessionActive} icon={<ShieldCheck size={18} />}>
            {session.isActive ? "수업 종료" : "수업 시작"}
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
      <div className="mt-5">
        <InfoPanel title="학생 접속 정보" icon={<KeyRound size={20} />}>
          <dl className="grid gap-3 text-sm md:grid-cols-[1.5fr_0.5fr]">
            <InfoRow label="학생 입장 링크" value={isStudentLinkReady ? studentLink : "AI 질문 초안 승인 후 생성됩니다"} />
            <InfoRow label="접속 코드" value={session.accessCode} />
            <InfoRow label="교사 해제 코드" value={getTeacherUnlockCode(session)} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={() => void copyText(isStudentLinkReady ? studentLink : "")} disabled={!isStudentLinkReady} icon={<Copy size={18} />}>
              링크 복사
            </SecondaryButton>
            {!isStudentLinkReady && <span className="rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-black text-danger">질문 흐름을 승인하고 수업을 시작해야 학생 링크가 활성화됩니다.</span>}
          </div>
        </InfoPanel>
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
                      {message.role === "user" ? "학생" : "챗봇"} � {stageLabel(message.stage)} � {formatTime(message.createdAt)}
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
                      <p className="font-black">{alertLabel(alert.alertType)} � {formatTime(alert.createdAt)}</p>
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
            <InfoPanel title="AI 상태" icon={<Sparkles size={20} />}>
              {student.aiLogs.length > 0 ? (
                <div className="space-y-2 text-xs font-semibold leading-5 text-muted">
                  {student.aiLogs.slice(-6).map((log) => (
                    <div key={log.id} className="rounded-[8px] bg-surface p-2">
                      <p className="font-black text-ink">
                        {log.purpose} · {log.used ? "AI 사용" : "기본 규칙 사용"}
                      </p>
                      {log.fallbackReason && <p>사유: {log.fallbackReason}</p>}
                      <p>{formatTime(log.createdAt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold text-muted">아직 AI 로그가 없습니다.</p>
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
        <span>{finalLabel ? "최종 승인 완료" : `초안 v${prompt.version}`} � {sourceLabel(prompt.source)}</span>
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

function StageProgress({ session, currentStage }: { session: SessionConfig; currentStage: string }) {
  const stages = getQuestionFlow(session);
  const currentIndex = Math.max(0, stages.findIndex((item) => item.stage === currentStage));
  return (
    <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(stages.length || 1, 10)}, minmax(0, 1fr))` }}>
      {stages.map((item, index) => (
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

function TextField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: "text" | "password" | "email" }) {
  const inputType = label.includes("PIN") ? "password" : type;
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input type={inputType} className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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
  const normalizedValue = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        className="focus-ring rounded-[8px] border border-line bg-surface px-3 py-3 font-semibold text-ink"
        value={normalizedValue}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          onChange(Math.min(max, Math.max(min, Number.isFinite(nextValue) ? nextValue : min)));
        }}
      />
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
