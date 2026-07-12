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
import { AI_ASSIST_LIMIT, DEFAULT_SESSION, STAGES } from "@/lib/defaults";
import { getInitialAssistantMessage } from "@/lib/flow";
import { limitPromptLength } from "@/lib/prompt-builder";
import { buildDefaultQuestionFlow, getChoicesForStage, getInitialQuestionStage, getQuestionFlow, getStudentQuestionFlow, injectTopic, MAX_QUESTION_COUNT } from "@/lib/question-flow";
import { buildRestartMessages, getActiveMessages, getRestartRecords } from "@/lib/restart-marker";
import { clearStudentRowsForTeacher, createEmptySession, deleteProjectRow, deleteStudentRow, getCurrentTeacher, getTeacherAccessToken, loadProjectData, loadStudentsForSession, loadStudentsForTeacher, loadTeacherData, loadTeacherProjects, saveTeacherSession, signInTeacher, signOutTeacher, signUpTeacher } from "@/lib/supabase-db";
import type { AiAssistLog, ChatMessage, PromptRecord, QuestionChoice, SafetyAlert, SessionConfig, Stage, StudentAnalysis, StudentWorkspace } from "@/lib/types";

type View = "home" | "student-login" | "student-chat" | "teacher-auth" | "teacher-settings" | "monitoring";
type TeacherView = "teacher-settings" | "monitoring";
type LegalDocType = "terms" | "privacy";

type AppData = {
  projects: SessionConfig[];
  activeProjectId: string | null;
  session: SessionConfig;
  students: StudentWorkspace[];
  projectStudents: StudentWorkspace[];
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
const LEGAL_DOCUMENTS: Record<LegalDocType, { title: string; content: string }> = {
  terms: {
    title: "이용약관",
    content: `ingyu's AI world(이하 "본 서비스") 이용약관에 오신 것을 환영합니다. 본 약관은 교육용 AI 프롬프트 생성 웹앱 "생각잇기 프롬프트"의 이용에 관한 기본 사항을 정합니다.

제1조 (목적)
본 약관은 본 서비스가 제공하는 수업 설계, 학생 문답, 이미지 생성 프롬프트 작성, 안전 점검 및 교사용 모니터링 기능의 이용과 관련하여 서비스 제공자, 교사, 학생 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (서비스의 제공)
1. 본 서비스는 교사가 수업 주제, 학습 목표, 질문 흐름, 필수 요소, 제약 조건을 설정하고 학생이 단계별 질문에 답하며 이미지 생성용 프롬프트를 완성할 수 있도록 돕는 교육용 웹앱입니다.
2. 주요 기능은 다음과 같습니다.
- 교사용 프로젝트 및 수업 설정 관리
- 입장코드를 통한 학생 참여
- 학생 답변 기반 단계별 질문 진행
- AI(Gemini API)를 활용한 질문 보조, 답변 안전성/관련성 점검, 프롬프트 개선
- 교사용 학생 활동 모니터링, 안전 경고 확인, 학습 분석 보조
- 완성된 프롬프트 복사 및 수업 피드백 지원

제3조 (서비스 이용 대상)
1. 본 서비스는 교실 수업에서 교사와 학생이 함께 사용하는 교육 목적의 도구입니다.
2. 교사는 수업 프로젝트를 생성하고 입장코드를 공유하며 학생 활동을 관리할 책임이 있습니다.
3. 학생은 교사의 안내와 수업 목적 범위 안에서 서비스를 이용해야 합니다.
4. 만 14세 미만 학생은 담당 교사 또는 보호자의 지도 아래 본 서비스를 이용합니다.

제4조 (서비스 이용 시간 및 변경)
1. 서비스는 가능한 한 안정적으로 제공되나, 시스템 점검, Supabase 또는 AI API 장애, 네트워크 장애, 배포 작업 등으로 일시 중단될 수 있습니다.
2. 서비스 기능, AI 모델, 저장 방식, 화면 구성은 교육적 필요와 운영 상황에 따라 변경될 수 있으며 중요한 변경은 가능한 범위에서 안내합니다.

제5조 (이용자의 의무)
이용자는 다음 행위를 해서는 안 됩니다.
1. 타인의 닉네임을 사용하여 접속하는 행위
2. 욕설, 비속어, 성적 표현, 혐오 표현, 괴롭힘 등 부적절한 내용을 입력하는 행위
3. 수업 주제와 무관한 내용이나 의미 없는 반복 입력으로 활동을 방해하는 행위
4. AI 안전 점검 또는 교사 모니터링을 의도적으로 우회하려는 행위
5. 서비스의 정상적인 작동을 방해하거나 무단으로 데이터에 접근하려는 행위

제6조 (서비스 제공자의 의무)
1. 서비스 제공자는 안정적인 교육 활동 지원을 위해 합리적인 범위에서 서비스를 유지하고 개선합니다.
2. 서비스 제공자는 학생 답변과 프롬프트 작성 과정에서 부적절한 표현을 줄이고 교사의 수업 운영을 돕기 위해 안전 점검 및 모니터링 기능을 제공합니다.
3. AI가 생성하거나 분석한 내용은 보조 자료이며, 최종 수업 판단과 학생 지도는 담당 교사가 수행합니다.

제7조 (저작권 및 이용)
1. 서비스의 화면 구성, 코드, 시스템 설계 등 서비스 자체에 관한 권리는 서비스 제공자에게 있습니다.
2. 학생이 입력한 답변과 이를 바탕으로 생성된 프롬프트는 해당 수업 활동의 결과물이며, 담당 교사는 교육 목적 범위에서 확인, 피드백, 공유, 게시할 수 있습니다.
3. 이용자는 타인의 권리를 침해하는 내용이나 공개가 부적절한 개인정보를 입력하지 않아야 합니다.

제8조 (책임의 제한)
1. 서비스 제공자는 천재지변, 외부 서비스(Supabase, Gemini API 등) 장애, 네트워크 문제, 이용자 기기 환경 등 통제하기 어려운 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.
2. 이용자가 부정확한 닉네임을 사용하거나 부적절한 내용을 입력하여 발생한 문제는 해당 이용자 및 수업 관리자의 책임 범위에 속합니다.
3. AI 응답은 오류가 있을 수 있으므로 교사는 수업 적용 전 내용을 검토해야 합니다.

제9조 (시행일)
본 약관은 2026년 3월 1일부터 시행됩니다. 약관 변경 시 서비스 화면 또는 별도 안내를 통해 고지합니다.`
  },
  privacy: {
    title: "개인정보처리방침",
    content: `ingyu's AI world는 "생각잇기 프롬프트" 이용자의 개인정보와 수업 데이터를 중요하게 생각합니다. 본 방침은 이 웹앱에서 실제 처리되는 정보와 이용 목적을 설명합니다.

1. 처리하는 개인정보 및 수업 데이터
1) 교사 계정 정보: 교사 로그인 및 프로젝트 관리를 위해 이메일 주소와 인증 정보가 Supabase Auth를 통해 처리됩니다. 비밀번호는 서비스 제공자가 직접 열람할 수 없는 방식으로 인증 서비스에서 관리됩니다.
2) 수업 프로젝트 정보: 수업 제목, 주제, 학습 목표, 결과물 유형, 필수 요소, 제약 조건, 질문 흐름, AI 사용 여부, 입장코드, 활성 상태, 수정 시각이 저장됩니다.
3) 학생 참여 정보: 학생이 입력한 닉네임, 입장코드, 참여한 수업 ID, 현재 진행 단계, 마지막 활동 시각이 저장됩니다.
4) 학생 활동 데이터: 학생과 AI 보조 메시지의 대화 내용, 학생 답변, 생성된 프롬프트 초안 및 최종 프롬프트, 부적절 표현 또는 붙여넣기 등 안전 경고 기록, AI 사용 로그, 교사용 분석 결과가 저장될 수 있습니다.
5) 본 서비스는 학생의 전화번호, 주소, 주민등록번호, 보호자 연락처 등 수업 진행에 필요하지 않은 민감한 정보를 요구하지 않습니다. 이용자는 이러한 정보를 답변에 입력하지 않아야 합니다.

2. 개인정보 및 데이터 이용 목적
수집된 정보는 다음 목적에 한해 사용됩니다.
- 교사 로그인 및 수업 프로젝트 관리
- 학생의 수업 입장 확인 및 진행 상태 유지
- 학생 답변을 바탕으로 한 단계별 질문 진행
- 이미지 생성 프롬프트 초안 작성 및 개선
- 부적절한 표현, 무의미한 답변, 주제 이탈 여부 점검
- 교사의 실시간 모니터링, 피드백, 학생별 학습 분석 보조
- 서비스 오류 확인 및 안정적 운영

3. 보유 및 이용 기간
1) 교사 계정 정보는 교사가 계정을 이용하는 기간 동안 보관됩니다.
2) 수업 프로젝트 및 학생 활동 데이터는 담당 교사가 프로젝트 또는 학생 기록을 삭제할 때까지 보관됩니다.
3) 서비스 운영상 보관이 필요하지 않거나 삭제 요청이 반영된 데이터는 가능한 범위에서 지체 없이 삭제합니다.
4) 법령상 보관 의무가 있는 경우 해당 기간 동안 보관할 수 있습니다.

4. 외부 서비스 이용 및 제3자 제공
1) 본 서비스는 데이터 저장과 인증을 위해 Supabase를 사용합니다.
2) AI 보조 기능을 위해 학생 답변, 최근 대화, 수업 주제, 질문, 프롬프트, 안전 경고 등 필요한 텍스트가 Gemini API 등 설정된 AI 제공자에게 전송될 수 있습니다.
3) AI 전송은 질문 보조, 안전성/관련성 분류, 프롬프트 개선, 교사용 분석을 위한 목적에 한정됩니다.
4) 서비스 제공자는 수집 데이터를 광고, 상업적 판매, 목적 외 마케팅에 사용하지 않습니다.

5. 안전성 확보 조치
서비스 제공자는 Supabase 인증, 프로젝트별 접근 관리, 서버 API 검증, 학생 데이터 삭제 기능 등을 통해 수업 데이터 접근을 제한하고자 노력합니다. 다만 현재 서비스는 교실 파일럿 및 교육용 운영 환경을 전제로 하므로, 교사는 입장코드와 학생 입력 내용이 외부에 노출되지 않도록 지도해야 합니다.

6. 이용자 및 교사의 권리
1) 교사는 본인이 만든 프로젝트와 학생 활동 기록을 확인하거나 삭제할 수 있습니다.
2) 학생 데이터 삭제가 필요한 경우 담당 교사를 통해 삭제를 요청할 수 있습니다.
3) 개인정보 관련 문의 또는 삭제 요청은 아래 연락처로 문의할 수 있습니다.

7. 개인정보책임자
- 개인정보책임자: 백인규 교사(서울가동초등학교)
- 문의: 02-448-5766

본 개인정보처리방침은 2026년 3월 1일부터 시행됩니다.`
  }
};
const APP_NAME = "생각잇기 프롬프트";
const APP_SUBTITLE = "학생 답변 기반 이미지 생성 프롬프트 수업 도구";

const initialData: AppData = {
  projects: [DEFAULT_SESSION],
  activeProjectId: DEFAULT_SESSION.id,
  session: DEFAULT_SESSION,
  students: [],
  projectStudents: []
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
  const [legalDoc, setLegalDoc] = useState<LegalDocType | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
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
        const teacherData = await loadTeacherData(user);
        const savedProjectId = nextData.activeProjectId;
        nextData = migrateSavedData(teacherData);
        if (savedProjectId && nextData.projects.some((project) => project.id === savedProjectId)) {
          const projectData = await loadProjectData(savedProjectId);
          nextData = migrateSavedData({
            ...nextData,
            activeProjectId: savedProjectId,
            session: projectData.session,
            students: projectData.students
          });
        }
        nextUi = { ...nextUi, isTeacherUnlocked: true, view: nextUi.view === "teacher-auth" ? "home" : nextUi.view };
      }

      nextData = migrateSavedData(nextData);

      const params = new URLSearchParams(window.location.search);
      const role = params.get("role");
      const urlCode = normalizeAccessCode(params.get("code") ?? "");
      if (role === "student") {
        const activeStudentForUrl = nextData.students.find((student) => student.id === nextUi.activeStudentId) ?? null;
        const canResumeStudent =
          activeStudentForUrl && (!urlCode || normalizeAccessCode(activeStudentForUrl.accessCode) === urlCode);
        nextUi = {
          ...nextUi,
          view: canResumeStudent ? "student-chat" : "student-login",
          activeStudentId: canResumeStudent ? activeStudentForUrl.id : null,
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
    if (!isLoaded || !teacherUser || ui.view !== "monitoring") return;

    const pollTimer = window.setInterval(async () => {
      const students = await loadStudentsForSession(data.session.id);
      setData((current) => replaceProjectStudents(current, current.session.id, students));
    }, 3000);

    return () => window.clearInterval(pollTimer);
  }, [data.session.id, isLoaded, teacherUser, ui.view]);

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
    const now = new Date().toISOString();
    const previous = data.session;
    const sameProject = previous.id === session.id;
    const baseRevision = (sameProject ? previous.revision : session.revision) ?? 1;
    // revision이 바뀌면 학생 재입장 시 진행이 초기화되므로,
    // 질문 흐름이나 주제가 실제로 바뀐 경우에만 올린다(수업 시작/종료 토글 제외).
    const contentChanged =
      sameProject &&
      (previous.topic !== session.topic || JSON.stringify(previous.questionFlow) !== JSON.stringify(session.questionFlow));
    const nextSession: SessionConfig = {
      ...session,
      revision: baseRevision + (contentChanged ? 1 : 0),
      updatedAt: now
    };

    setData((current) => ({
      ...current,
      projects: upsertProject(current.projects, nextSession),
      activeProjectId: nextSession.id,
      session: nextSession
    }));

    if (teacherUser) {
      void saveTeacherSession(nextSession, teacherUser)
        .then((savedSession) => {
          setData((latest) => ({ ...latest, session: savedSession, activeProjectId: savedSession.id, projects: upsertProject(latest.projects, savedSession) }));
          void refreshProjects(teacherUser);
        })
        .catch(() => window.alert("수업 설정을 서버에 저장하지 못했습니다. 네트워크를 확인해 주세요."));
    }
  }

  async function refreshProjects(user = teacherUser) {
    if (!user) return;
    const projects = await loadTeacherProjects(user);
    const allStudents = await loadStudentsForTeacher(user.id);
    setData((current) => ({
      ...current,
      projects: projects.length > 0 ? projects.map((project) => (project.id === current.session.id ? current.session : project)) : [current.session],
      projectStudents: allStudents
    }));
  }

  async function openProject(projectId: string, target: TeacherView | "home" = "monitoring") {
    const projectData = await loadProjectData(projectId);
    setData((current) => {
      const nextSession = migrateSession(projectData.session);
      return replaceProjectStudents(
        {
          ...current,
          projects: upsertProject(current.projects, nextSession),
          activeProjectId: nextSession.id,
          session: nextSession,
          students: projectData.students
        },
        nextSession.id,
        projectData.students
      );
    });
    setUi((current) => ({ ...current, view: target, activeStudentId: null, isTeacherStudentPreview: false }));
  }

  function createNewProject() {
    const nextSession = createEmptySession();
    setData((current) => ({
      ...current,
      projects: [nextSession, ...current.projects],
      activeProjectId: nextSession.id,
      session: nextSession,
      students: []
    }));
    setUi((current) => ({ ...current, view: "teacher-settings", activeStudentId: null, isTeacherStudentPreview: false }));
  }

  async function deleteProject(projectId: string) {
    const project = data.projects.find((item) => item.id === projectId);
    const title = project?.title || project?.topic || "이 프로젝트";
    if (!window.confirm(`${title}을(를) 삭제할까요?\n학생 활동 기록도 함께 삭제됩니다.`)) return;

    try {
      await deleteProjectRow(projectId);
      const remainingProjects = data.projects.filter((item) => item.id !== projectId);
      const remainingStudents = data.projectStudents.filter((student) => student.sessionId !== projectId);
      const nextProject = remainingProjects[0] ?? createEmptySession();
      const nextStudents = remainingStudents.filter((student) => student.sessionId === nextProject.id);

      setData({
        projects: remainingProjects.length > 0 ? remainingProjects : [nextProject],
        activeProjectId: nextProject.id,
        session: nextProject,
        students: nextStudents,
        projectStudents: remainingProjects.length > 0 ? remainingStudents : []
      });
      setUi((current) => ({ ...current, view: remainingProjects.length > 0 ? "home" : "teacher-settings", activeStudentId: null, isTeacherStudentPreview: false }));
      if (teacherUser) void refreshProjects(teacherUser);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "프로젝트를 삭제하지 못했습니다.");
    }
  }

  function upsertStudent(student: StudentWorkspace) {
    if (student.sessionId) {
      void fetch("/api/student/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student })
      })
        .then(async (response) => {
          if (response.ok) {
            setSaveWarning("");
            return;
          }
          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          setSaveWarning(result?.error ?? "활동 기록을 서버에 저장하지 못했습니다.");
        })
        .catch(() => setSaveWarning("활동 기록을 서버에 저장하지 못했습니다. 네트워크를 확인해 주세요."));
    }

    setData((current) => ({
      ...current,
      students: current.students.some((item) => item.id === student.id)
        ? current.students.map((item) => (item.id === student.id ? student : item))
        : [...current.students, student],
      projectStudents: current.projectStudents.some((item) => item.id === student.id)
        ? current.projectStudents.map((item) => (item.id === student.id ? student : item))
        : [...current.projectStudents, student]
    }));
  }

  function resetStudent(studentId: string) {
    const target = data.students.find((student) => student.id === studentId);
    if (!target) return;

    const now = new Date().toISOString();
    const initialStage = getInitialQuestionStage(data.session);
    const nextStudent: StudentWorkspace = {
      ...target,
      currentStage: initialStage,
      joinedRevision: data.session.revision ?? 1,
      lastActiveAt: now,
      messages: buildRestartMessages(target, data.session, now, createAssistantMessage(getInitialAssistantMessage(data.session), initialStage)),
      prompts: [],
      analysis: undefined
    };
    upsertStudent(nextStudent);
  }

  async function deleteStudent(studentId: string) {
    try {
      await deleteStudentRow(studentId);
      setData((current) => ({
        ...current,
        students: current.students.filter((student) => student.id !== studentId),
        projectStudents: current.projectStudents.filter((student) => student.id !== studentId)
      }));
      setUi((current) => ({ ...current, activeStudentId: current.activeStudentId === studentId ? null : current.activeStudentId }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "학생 데이터를 삭제하지 못했습니다.");
    }
  }

  async function clearStudents() {
    if (!teacherUser) return;
    if (!window.confirm("이 프로젝트의 학생 활동 기록을 모두 삭제할까요?")) return;

    try {
      await clearStudentRowsForTeacher(teacherUser.id, data.session.id);
      const remainingStudents = await loadStudentsForSession(data.session.id);
      setData((current) => replaceProjectStudents(current, current.session.id, remainingStudents, { preserveLocal: false }));
      setUi((current) => ({ ...current, activeStudentId: null }));
      if (remainingStudents.length > 0) {
        window.alert(`삭제 요청 후에도 ${remainingStudents.length}명의 기록이 남아 있습니다. 잠시 뒤 다시 시도해 주세요.`);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "학생 데이터를 삭제하지 못했습니다.");
    }
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
    <main className="app-shell flex min-h-screen flex-col">
      <TopBar view={ui.view} session={data.session} setView={setView} openTeacherView={openTeacherView} openStudentPreview={openStudentPreview} isTeacherStudentPreview={ui.isTeacherStudentPreview} teacherUser={teacherUser} onLogout={() => void logoutTeacher()} />
      <div className="flex-1">
        {ui.view === "home" && (
          <HomeView
            projects={data.projects}
            students={data.projectStudents}
            activeProjectId={data.activeProjectId}
            onOpenProject={(projectId) => void openProject(projectId, "monitoring")}
            onCreateProject={createNewProject}
            onDeleteProject={(projectId) => void deleteProject(projectId)}
            onRefresh={() => void refreshProjects()}
            isTeacherAuthenticated={Boolean(teacherUser)}
          />
        )}
        {ui.view === "student-login" && (
          <StudentLoginView
            session={data.session}
            students={data.students}
            onEnter={(student, session) => {
              if (session) {
                setData((current) => ({
                  ...current,
                  session,
                  activeProjectId: session.id,
                  projects: upsertProject(current.projects, session)
                }));
              }
              upsertStudent(student);
              setUi((current) => ({ ...current, activeStudentId: student.id, view: "student-chat" }));
            }}
          />
        )}
        {ui.view === "student-chat" && activeStudent && <StudentChatView session={data.session} student={activeStudent} saveWarning={saveWarning} onChange={upsertStudent} onReset={() => resetStudent(activeStudent.id)} />}
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
      </div>
      <AppFooter onOpenLegal={setLegalDoc} />
      {legalDoc && <LegalModal document={LEGAL_DOCUMENTS[legalDoc]} onClose={() => setLegalDoc(null)} />}
    </main>
  );
}

function migrateSavedData(data: AppData): AppData {
  const session = migrateSession(data.session ?? DEFAULT_SESSION);
  const hasMatchingQuestionFlow = questionFlowMatchesTopic(session);
  const nextSession = {
    ...session,
    questionFlow: hasMatchingQuestionFlow ? session.questionFlow : [],
    lessonDesigned: Boolean(session.lessonDesigned && session.questionFlow.length > 0 && hasMatchingQuestionFlow),
    isActive: Boolean(session.isActive && session.lessonDesigned && hasMatchingQuestionFlow)
  };
  const projects = (data.projects?.length ? data.projects : [nextSession]).map(migrateSession);
  const activeProjectId = data.activeProjectId && projects.some((project) => project.id === data.activeProjectId) ? data.activeProjectId : nextSession.id;

  return {
    ...data,
    projects: upsertProject(projects, nextSession),
    activeProjectId,
    session: nextSession,
    students: data.students ?? [],
    projectStudents: data.projectStudents ?? data.students ?? []
  };
}

function migrateSession(session: SessionConfig): SessionConfig {
  return {
    ...DEFAULT_SESSION,
    ...session,
    requiredElements: session.requiredElements ?? [],
    constraints: session.constraints ?? [],
    questionFlow: session.questionFlow ?? [],
    revision: session.revision ?? 1,
    updatedAt: session.updatedAt ?? new Date(0).toISOString(),
    aiCallsPerStudentLimit: AI_ASSIST_LIMIT
  };
}

function upsertProject(projects: SessionConfig[], session: SessionConfig) {
  const nextProjects = projects.some((project) => project.id === session.id)
    ? projects.map((project) => (project.id === session.id ? session : project))
    : [session, ...projects];

  return nextProjects.sort((left, right) => parseTime(right.updatedAt) - parseTime(left.updatedAt));
}

function replaceProjectStudents(data: AppData, sessionId: string, students: StudentWorkspace[], options: { preserveLocal?: boolean } = {}): AppData {
  const nextStudents = options.preserveLocal === false ? students : mergeLocalStudentProgress(data.students, students);
  const otherStudents = data.projectStudents.filter((student) => student.sessionId !== sessionId);
  return {
    ...data,
    students: nextStudents,
    projectStudents: [...otherStudents, ...nextStudents]
  };
}

function mergeLocalStudentProgress(localStudents: StudentWorkspace[], serverStudents: StudentWorkspace[]) {
  return serverStudents.map((serverStudent) => {
    const localStudent = localStudents.find((student) => student.id === serverStudent.id);
    if (!localStudent) return serverStudent;
    return isStudentProgressNewer(localStudent, serverStudent) ? { ...localStudent, lessonTopic: serverStudent.lessonTopic ?? localStudent.lessonTopic } : serverStudent;
  });
}

function isStudentProgressNewer(left: StudentWorkspace, right: StudentWorkspace) {
  const leftTime = parseTime(left.lastActiveAt);
  const rightTime = parseTime(right.lastActiveAt);
  if (leftTime !== rightTime) return leftTime > rightTime;
  return getStudentProgressWeight(left) > getStudentProgressWeight(right);
}

function getStudentProgressWeight(student: StudentWorkspace) {
  return student.messages.length + student.prompts.length * 3 + student.safetyAlerts.length + student.aiLogs.length;
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

function normalizeAccessCode(code: string) {
  return code.trim().toUpperCase();
}

function previewQuestion(question: string, session: SessionConfig) {
  return injectTopic(question, session);
}

function isLockingAlert(alertType: SafetyAlert["alertType"]) {
  return ["paste_attempt", "profanity", "sexual", "abusive"].includes(alertType);
}

function lockMessage() {
  return "안전 확인이 필요한 입력이 3회 누적되어 활동이 잠겼습니다. 선생님께 말씀드리고, 선생님이 해제 코드를 입력하면 다시 이어갈 수 있어요.";
}

function pasteWarningMessage() {
  return "복사해서 붙여넣기보다는 지금 질문을 읽고 네 생각을 직접 적어 주세요. 짧아도 괜찮아요. 네 말로 쓴 답변을 바탕으로 프롬프트를 만들어 볼게요.";
}

function safetyAlertStudentMessage(alertType: SafetyAlert["alertType"], session: SessionConfig, stage: Stage) {
  if (alertType === "paste_attempt") return pasteWarningMessage();
  if (alertType === "sexual") return "음란하거나 성적인 표현은 이 수업 활동에서 사용할 수 없어요. 오늘 수업 주제에 맞는 안전한 장면으로 다시 적어 주세요.";
  if (alertType === "abusive") return "폭언, 모욕, 혐오 표현은 사용할 수 없어요. 사람을 존중하는 표현으로 바꾸어 다시 적어 주세요.";
  if (alertType === "profanity") return "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 같은 생각이라도 바른 말로 바꾸어 다시 적어 주세요.";
  if (alertType === "off_topic") return `지금 답변은 수업 주제와 조금 멀어 보여요. "${session.topic}"와 연결되는 장면이나 생각으로 다시 적어 주세요.`;
  const currentQuestion = getQuestionFlow(session).find((item) => item.stage === stage)?.question ?? "";
  return `아무 말이나 쓰기보다, 지금 질문에 맞춰 떠오르는 장면이나 생각을 네 말로 적어 주세요. ${previewQuestion(currentQuestion, session)}`;
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

function AppFooter({ onOpenLegal }: { onOpenLegal: (type: LegalDocType) => void }) {
  return (
    <footer className="mt-8 border-t border-line/70 bg-ink px-4 py-6 text-center text-xs font-semibold text-white/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <button type="button" className="font-black text-white transition hover:text-primarySoft" onClick={() => onOpenLegal("terms")}>
            이용약관
          </button>
          <button type="button" className="font-black text-white transition hover:text-primarySoft" onClick={() => onOpenLegal("privacy")}>
            개인정보처리방침
          </button>
        </div>
        <p>© 2026 ingyu&apos;s AI world. All rights reserved.</p>
        <p>개인정보책임자: 서울가동초등학교 백인규 교사 (02-448-5766)</p>
      </div>
    </footer>
  );
}

function LegalModal({ document, onClose }: { document: { title: string; content: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
      <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[8px] bg-white shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="legal-modal-title" className="text-lg font-black text-ink">
            {document.title}
          </h2>
          <button type="button" className="rounded-[8px] p-2 text-muted transition hover:bg-surface hover:text-ink" onClick={onClose} title="닫기">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm font-semibold leading-7 text-ink">{document.content}</p>
        </div>
      </section>
    </div>
  );
}

function TopBar({
  view,
  session,
  setView,
  openTeacherView,
  openStudentPreview,
  isTeacherStudentPreview,
  teacherUser,
  onLogout
}: {
  view: View;
  session: SessionConfig;
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
            <NavButton active={view === "home"} onClick={() => setView("home")}>
              프로젝트
            </NavButton>
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
      {teacherUser && !shouldHideTeacherNav && (
        <div className="page-band pb-3 text-xs font-black text-muted">
          현재 프로젝트: <span className="text-primary">{session.title || session.topic || "새 프로젝트"}</span>
        </div>
      )}
    </header>
  );
}
function HomeView({
  projects,
  students,
  activeProjectId,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onRefresh,
  isTeacherAuthenticated
}: {
  projects: SessionConfig[];
  students: StudentWorkspace[];
  activeProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onRefresh: () => void;
  isTeacherAuthenticated: boolean;
}) {
  const studentCountByProject = useMemo(() => {
    const counts = new Map<string, { total: number; final: number }>();
    for (const student of students) {
      if (!student.sessionId) continue;
      const current = counts.get(student.sessionId) ?? { total: 0, final: 0 };
      current.total += 1;
      if (student.prompts.some((prompt) => prompt.isFinal)) current.final += 1;
      counts.set(student.sessionId, current);
    }
    return counts;
  }, [students]);

  return (
    <section className="page-band py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-primary">교사용 프로젝트</p>
          <h1 className="text-3xl font-black text-ink">프로젝트 목록</h1>
        </div>
        {isTeacherAuthenticated && (
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={onRefresh} icon={<RotateCcw size={18} />}>새로고침</SecondaryButton>
            <PrimaryButton type="button" onClick={onCreateProject} icon={<Plus size={18} />}>새 프로젝트</PrimaryButton>
          </div>
        )}
      </div>
      {!isTeacherAuthenticated ? (
        <div className="mt-5">
          <InfoPanel title="교사 로그인이 필요합니다" icon={<ShieldCheck size={20} />}>
            <p className="text-sm font-semibold leading-6 text-muted">프로젝트 목록과 학생 기록은 교사 로그인 후 확인할 수 있습니다.</p>
          </InfoPanel>
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-5 rounded-[8px] border border-line bg-white p-8 text-center shadow-soft">
          <p className="font-bold text-muted">아직 프로젝트가 없습니다.</p>
          <PrimaryButton className="mt-4" onClick={onCreateProject} icon={<Plus size={18} />}>새 프로젝트</PrimaryButton>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const counts = studentCountByProject.get(project.id) ?? { total: 0, final: 0 };
            const isActiveProject = project.id === activeProjectId;
            return (
              <div
                role="button"
                tabIndex={0}
                key={project.id}
                className={`cursor-pointer rounded-[8px] border bg-white p-4 text-left shadow-soft transition hover:border-primary ${isActiveProject ? "border-primary" : "border-line"}`}
                onClick={() => onOpenProject(project.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenProject(project.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-primary">{project.isActive ? "진행 중" : "보관됨"}</p>
                    <h2 className="mt-1 text-lg font-black text-ink">{project.title || project.topic || "새 프로젝트"}</h2>
                  </div>
                  <span className="flex items-center gap-2">
                    {isActiveProject && <Check className="text-primary" size={18} />}
                    <button
                      type="button"
                      className="inline-flex rounded-[8px] p-2 text-danger hover:bg-dangerSoft"
                      title="프로젝트 삭제"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteProject(project.id);
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-muted">{project.topic || "수업 주제가 아직 없습니다."}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <InfoRow label="학생" value={`${counts.total}명`} />
                  <InfoRow label="완료" value={`${counts.final}명`} />
                  <InfoRow label="코드" value={project.accessCode} />
                </div>
                <p className="mt-3 text-xs font-bold text-muted">최근 수정 {formatDateTime(project.updatedAt)}</p>
              </div>
            );
          })}
        </div>
      )}
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
      setError("닉네임을 입력해주세요.");
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
  }

  return (
    <section className="page-band grid min-h-[calc(100vh-72px)] place-items-center py-10">
      <form className="w-full max-w-[520px] rounded-[8px] border border-line bg-white p-6 shadow-soft" onSubmit={submit}>
        <span className="grid h-12 w-12 place-items-center rounded-[8px] bg-primarySoft text-primary">
          <KeyRound size={24} />
        </span>
        <h1 className="mt-5 text-3xl font-black text-ink">학생 입장</h1>
        <p className="mt-2 font-semibold leading-7 text-muted">선생님이 알려준 접속 코드와 닉네임을 입력하면 시작합니다. 이미 진행 중이었다면 새로고침 뒤에도 이어서 할 수 있어요.</p>
        <div className="mt-6 grid gap-4">
          <TextField label="닉네임" value={name} onChange={setName} placeholder="예: 하늘" />
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

function StudentChatView({ session, student, saveWarning, onChange, onReset }: { session: SessionConfig; student: StudentWorkspace; saveWarning: string; onChange: (student: StudentWorkspace) => void; onReset: () => void }) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unlockCode, setUnlockCode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestPrompt = student.prompts.at(-1);
  const finalPrompt = student.prompts.find((prompt) => prompt.isFinal);
  const studentStages = getStudentQuestionFlow(session);
  const stageIndex = studentStages.findIndex((item) => item.stage === student.currentStage);
  const activeSafetyAlerts = getActiveSafetyAlerts(student);
  const isLocked = activeSafetyAlerts.length >= 3;
  const isFinalized = Boolean(finalPrompt);
  const currentChoices = getChoicesForStage(session, student.currentStage);
  const activeMessages = getActiveMessages(student.messages);
  const aiUsedCount = student.aiLogs.filter((log) => log.used).length;
  const latestActiveSafetyAlert = activeSafetyAlerts.at(-1);
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
  }, [activeMessages.length]);

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
    const nextMessages = [...student.messages, createAssistantMessage(pasteWarningMessage(), student.currentStage)];
    if (getActiveSafetyAlerts({ ...student, safetyAlerts: nextAlerts }).length >= 3) {
      nextMessages.push(createAssistantMessage(lockMessage(), student.currentStage));
    }
    onChange({ ...student, messages: nextMessages, safetyAlerts: nextAlerts, lastActiveAt: now });
  }

  async function unlockStudent(event: FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/student/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, clientToken: student.clientToken, code: unlockCode.trim() })
    }).catch(() => null);

    if (!response?.ok) {
      const result = response ? ((await response.json().catch(() => null)) as { error?: string } | null) : null;
      setUnlockError(result?.error ?? "해제 코드를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
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
    setSendError("");
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          clientToken: student.clientToken,
          history: activeMessages,
          message: trimmed,
          currentStage: student.currentStage,
          latestPrompt: latestPrompt?.content,
          loopCount: latestPrompt?.loopCount ?? 0
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? "채팅 응답을 받지 못했습니다.");
      }

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
          nextMessages.push(createAssistantMessage(lockMessage(), student.currentStage));
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
          nextMessages.push(createAssistantMessage(lockMessage(), student.currentStage));
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
          content: limitPromptLength(result.draftPrompt),
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
    } catch (error) {
      setInput(trimmed);
      setSendError(error instanceof Error ? error.message : "메시지를 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="page-band grid min-h-[calc(100dvh-73px)] gap-4 py-3 sm:py-4 lg:h-[calc(100vh-73px)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
      {isLocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
          <form className="w-full max-w-md rounded-[8px] border border-danger/30 bg-white p-5 shadow-soft" onSubmit={(event) => void unlockStudent(event)}>
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
            {latestActiveSafetyAlert && (
              <div className="mt-3 rounded-[8px] bg-surface px-3 py-2 text-sm font-semibold leading-6 text-ink">
                <strong className="block text-danger">마지막 안내</strong>
                {safetyAlertStudentMessage(latestActiveSafetyAlert.alertType, session, student.currentStage)}
              </div>
            )}
            <TextField label="교사 해제 코드" value={unlockCode} onChange={setUnlockCode} placeholder="숫자 4자리" type="password" />
            {unlockError && <p className="mt-3 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{unlockError}</p>}
            <PrimaryButton type="submit" className="mt-4 w-full justify-center" icon={<ShieldCheck size={18} />}>
              잠금 해제
            </PrimaryButton>
          </form>
        </div>
      )}
      <div className="flex min-h-[70dvh] flex-col rounded-[8px] border border-line bg-white shadow-soft lg:min-h-0">
        <div className="shrink-0 border-b border-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-primary">{session.topic}</p>
              <h1 className="truncate text-xl font-black text-ink sm:text-2xl">{student.name}의 프롬프트 대화</h1>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <span className="rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-black text-secondary">{studentStages[Math.max(stageIndex, 0)]?.label ?? stageLabel(student.currentStage)}</span>
              <SecondaryButton type="button" className="px-3 py-2" onClick={onReset} icon={<RotateCcw size={16} />}>
                처음부터 진행
              </SecondaryButton>
            </div>
          </div>
          <StageProgress session={session} currentStage={student.currentStage} />
        </div>
        <div ref={scrollRef} className="max-h-[52dvh] min-h-[280px] flex-1 space-y-4 overflow-y-auto p-3 sm:p-4 lg:max-h-none lg:min-h-0">
          {activeMessages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {isSending && (
            <div className="flex items-center gap-2 rounded-[8px] bg-secondarySoft px-3 py-2 text-sm font-bold text-secondary">
              <Loader2 className="animate-spin" size={16} /> 답변을 정리하는 중
            </div>
          )}
        </div>
        <form
          className="shrink-0 border-t border-line p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          {currentChoices.length > 0 && !isFinalized && !isLocked && (
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
              {currentChoices.map((choice) => (
                <button
                  key={`${choice.label}-${choice.value}`}
                  type="button"
                  className="focus-ring min-h-11 rounded-[8px] border border-line bg-white px-3 py-2 text-left text-sm font-black text-ink hover:border-primary hover:bg-primarySoft"
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
          {sendError && <p className="mb-3 rounded-[8px] bg-dangerSoft px-3 py-2 text-sm font-bold text-danger">{sendError}</p>}
          {saveWarning && <p className="mb-3 rounded-[8px] bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">저장 안내: {saveWarning}</p>}
          <textarea
            className="focus-ring h-24 w-full resize-none rounded-[8px] border border-line bg-surface p-3 text-base font-semibold leading-7 text-ink sm:h-20"
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
            disabled={isFinalized || isLocked}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
            <div className="grid gap-2 sm:flex">
              {student.currentStage === "revise" && (
                <>
                  <SecondaryButton type="button" className="justify-center" onClick={() => void sendMessage("조금 더 구체적으로 바꿔줘")}>
                    더 구체적으로
                  </SecondaryButton>
                  <SecondaryButton type="button" className="justify-center" onClick={() => void sendMessage("이걸로 확정할래요")}>
                    이걸로 확정
                  </SecondaryButton>
                </>
              )}
            </div>
            <PrimaryButton type="submit" className="justify-center sm:min-w-24" disabled={isSending || isFinalized || isLocked}>{isFinalized ? "완료" : "보내기"}</PrimaryButton>
          </div>
        </form>
      </div>
      <aside className="flex min-h-0 flex-col gap-4 lg:overflow-hidden">
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
        <InfoPanel title="프롬프트 작성 팁" icon={<Sparkles size={20} />}>
          <ul className="space-y-2 text-sm font-semibold leading-6 text-muted">
            <li>누가, 어디에서, 무엇을 하는지 장면처럼 말해 보세요.</li>
            <li>색, 분위기, 빛, 시점, 그림 스타일을 하나씩 더하면 좋아요.</li>
            <li>넣고 싶은 것과 빼고 싶은 것을 분명히 말하면 결과가 더 정확해져요.</li>
          </ul>
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
      aiCallsPerStudentLimit: AI_ASSIST_LIMIT,
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
      const token = await getTeacherAccessToken();
      const response = await fetch("/api/lesson-design", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
          aiCallsPerStudentLimit: AI_ASSIST_LIMIT,
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

  function updateChoice(stage: Stage, choiceIndex: number, field: keyof QuestionChoice, value: string) {
    setDraft((current) => ({
      ...current,
      lessonDesigned: true,
      questionFlow: current.questionFlow.map((item) => {
        if (item.stage !== stage) return item;
        const choices = [...(item.choices ?? [])];
        choices[choiceIndex] = {
          ...choices[choiceIndex],
          [field]: value
        };
        return { ...item, choices };
      })
    }));
  }

  function addChoice(stage: Stage) {
    setDraft((current) => ({
      ...current,
      lessonDesigned: true,
      questionFlow: current.questionFlow.map((item) => {
        if (item.stage !== stage) return item;
        const nextNumber = (item.choices?.length ?? 0) + 1;
        return {
          ...item,
          choices: [
            ...(item.choices ?? []),
            {
              label: `선택지 ${nextNumber}`,
              value: "",
              description: ""
            }
          ]
        };
      })
    }));
  }

  function deleteChoice(stage: Stage, choiceIndex: number) {
    setDraft((current) => ({
      ...current,
      lessonDesigned: true,
      questionFlow: current.questionFlow.map((item) => (item.stage === stage ? { ...item, choices: (item.choices ?? []).filter((_, index) => index !== choiceIndex) } : item))
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
      aiCallsPerStudentLimit: AI_ASSIST_LIMIT,
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
            <div className="grid gap-2 rounded-[8px] border border-line bg-surface px-3 py-3">
              <span className="text-sm font-black text-muted">학생당 AI 보조 한도</span>
              <span className="text-lg font-black text-ink">{AI_ASSIST_LIMIT}회 고정</span>
            </div>
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
                      <div className="rounded-[8px] border border-line bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-ink">학생이 고를 예시 답변</p>
                            <p className="mt-1 text-xs font-bold leading-5 text-muted">학생에게 버튼으로 보여줄 예시 답변을 만듭니다. 학생은 이 버튼을 누르거나 직접 입력할 수 있습니다.</p>
                          </div>
                          <SecondaryButton type="button" className="px-3 py-2" onClick={() => addChoice(item.stage)} icon={<Plus size={14} />}>
                            예시 답변 추가
                          </SecondaryButton>
                        </div>
                        {(item.choices ?? []).length === 0 ? (
                          <p className="mt-3 rounded-[8px] bg-surface px-3 py-2 text-xs font-bold text-muted">선택지가 없으면 학생은 직접 입력만 합니다.</p>
                        ) : (
                          <div className="mt-3 grid gap-3">
                            {(item.choices ?? []).map((choice, choiceIndex) => (
                              <div key={`${item.stage}-choice-${choiceIndex}`} className="grid gap-2 rounded-[8px] bg-surface p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-black text-muted">선택지 {choiceIndex + 1}</span>
                                  <button type="button" className="text-danger" onClick={() => deleteChoice(item.stage, choiceIndex)} title="선택지 삭제">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <div className="grid gap-2 md:grid-cols-[0.75fr_1.25fr]">
                                  <label className="grid gap-1">
                                    <span className="text-xs font-black text-muted">학생에게 보이는 버튼 글자</span>
                                    <input className="focus-ring rounded-[8px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink" value={choice.label} onChange={(event) => updateChoice(item.stage, choiceIndex, "label", event.target.value)} placeholder="예: 갈등 포착" />
                                  </label>
                                  <label className="grid gap-1">
                                    <span className="text-xs font-black text-muted">버튼을 누르면 전송될 답변</span>
                                    <input className="focus-ring rounded-[8px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink" value={choice.value} onChange={(event) => updateChoice(item.stage, choiceIndex, "value", event.target.value)} placeholder="예: 가상현실 속 문제 상황이 드러나는 장면을 그리고 싶어요." />
                                  </label>
                                </div>
                                <label className="grid gap-1">
                                  <span className="text-xs font-black text-muted">버튼 아래에 보일 짧은 설명</span>
                                  <input className="focus-ring rounded-[8px] border border-line bg-white px-3 py-2 text-sm font-semibold text-ink" value={choice.description ?? ""} onChange={(event) => updateChoice(item.stage, choiceIndex, "description", event.target.value)} placeholder="예: 주제의 핵심 문제가 보이는 장면" />
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold leading-5 text-muted">학생에게 보일 질문 미리보기: {previewQuestion(item.question, currentDraft())}</p>
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
    const header = ["student_name", "lesson_topic", "current_stage", "last_active_at", "restart_count", "loop_count", "final_prompt", "alert_count", "analysis_summary"];
    const rows = students.map((student) => {
      const latest = student.prompts.at(-1);
      const final = student.prompts.find((prompt) => prompt.isFinal);
      return [student.name, student.lessonTopic ?? session.topic, student.currentStage, student.lastActiveAt, getRestartRecords(student).length, latest?.loopCount ?? 0, final?.content ?? latest?.content ?? "", student.safetyAlerts.length, student.analysis?.summary ?? ""];
    });
    // BOM은 엑셀 한글 깨짐 방지, 선행 특수문자 이스케이프는 수식 인젝션 방지용.
    const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
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
      const token = await getTeacherAccessToken();
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
            이 프로젝트 학생 삭제
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
            <InfoRow label="교사 해제 코드" value={session.unlockCode ?? "수업 저장 후 표시됩니다"} />
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
        <div className="grid grid-cols-[1fr_1fr_0.9fr_0.7fr_0.7fr_1.4fr_0.5fr] gap-3 border-b border-line bg-surface px-4 py-3 text-sm font-black text-muted max-lg:hidden">
          <span>학생</span>
          <span>수업 주제</span>
          <span>현재 단계</span>
          <span>처음부터</span>
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
              <div
                role="button"
                tabIndex={0}
                key={student.id}
                className="grid w-full cursor-pointer gap-3 border-b border-line px-4 py-4 text-left text-sm font-semibold text-ink transition hover:bg-primarySoft/50 last:border-b-0 lg:grid-cols-[1fr_1fr_0.9fr_0.7fr_0.7fr_1.4fr_0.5fr]"
                onClick={() => setSelectedStudentId(student.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedStudentId(student.id);
                  }
                }}
              >
                <span>
                  <strong className="block text-base">{student.name}</strong>
                  <span className="text-muted">{formatTime(student.lastActiveAt)}</span>
                </span>
                <span className="truncate">{student.lessonTopic ?? session.topic}</span>
                <span>{stageLabel(student.currentStage)}</span>
                <span>{getRestartRecords(student).length}회</span>
                <span className={student.safetyAlerts.length > 0 ? "text-danger" : "text-muted"}>{student.safetyAlerts.length}건</span>
                <span className="truncate">{final ? final.content : latest ? `초안 v${latest.version}` : "대화 중"}</span>
                <span>
                  <button
                    type="button"
                    className="inline-flex text-danger"
                    title="학생 삭제"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteStudent(student.id);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </span>
              </div>
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
  const restartRecords = getRestartRecords(student);
  const activeMessages = getActiveMessages(student.messages);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[8px] bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-sm font-black text-primary">{student.lessonTopic ?? session.topic}</p>
            <p className="mt-1 text-sm font-bold text-muted">처음부터 진행 {restartRecords.length}회</p>
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
                {activeMessages.map((message) => (
                  <div key={message.id} className={`rounded-[8px] p-3 ${message.role === "user" ? "bg-primarySoft" : "bg-surface"}`}>
                    <p className="text-xs font-black text-muted">
                      {message.role === "user" ? "학생" : "챗봇"} · {stageLabel(message.stage)} · {formatTime(message.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{message.content}</p>
                  </div>
                ))}
              </div>
            </InfoPanel>
            {restartRecords.length > 0 && (
              <InfoPanel title="이전 진행 기록" icon={<RotateCcw size={20} />}>
                <div className="space-y-3">
                  {restartRecords
                    .slice()
                    .reverse()
                    .map((record, index) => (
                      <details key={record.id} className="rounded-[8px] bg-surface p-3 text-sm font-semibold leading-6 text-ink">
                        <summary className="cursor-pointer font-black">
                          {restartRecords.length - index}회차 재시작 전 대화 · {record.topic || session.topic} · {formatTime(record.createdAt)}
                        </summary>
                        <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                          {record.messages.length > 0 ? (
                            record.messages.map((message) => (
                              <div key={message.id} className={`rounded-[8px] p-3 ${message.role === "user" ? "bg-primarySoft" : "bg-white"}`}>
                                <p className="text-xs font-black text-muted">
                                  {message.role === "user" ? "학생" : "챗봇"} · {stageLabel(message.stage)} · {formatTime(message.createdAt)}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-muted">저장된 이전 대화가 없습니다.</p>
                          )}
                        </div>
                      </details>
                    ))}
                </div>
              </InfoPanel>
            )}
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
                <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1 text-sm font-semibold leading-6 text-ink">
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
  const displayPrompt = limitPromptLength(prompt.content);

  async function copyPrompt() {
    await copyText(displayPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button type="button" className="w-full rounded-[8px] bg-surface p-3 text-left transition hover:bg-primarySoft" onClick={() => void copyPrompt()} title="클릭해서 복사">
      <p className="sr-only">
        <span>{finalLabel ? "최종 프롬프트" : `프롬프트 v${prompt.version}`}</span>
        <span className="inline-flex items-center gap-1 text-primary">
          <Copy size={14} /> {copied ? "복사됨" : "클릭 복사"}
        </span>
      </p>
      <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-ink">{displayPrompt}</p>
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
  const stages = [
    ...getStudentQuestionFlow(session),
    { stage: "revise", label: "수정", question: "" },
    { stage: "final", label: "최종 확인", question: "" }
  ];
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

function alertLabel(alertType: SafetyAlert["alertType"]) {
  if (alertType === "paste_attempt") return "붙여넣기";
  if (alertType === "profanity") return "욕설/비속어";
  if (alertType === "sexual") return "성적 표현";
  if (alertType === "abusive") return "폭언/혐오";
  if (alertType === "off_topic") return "주제 이탈";
  return "무의미 입력";
}

function csvCell(cell: unknown) {
  const text = String(cell ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatTime(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(time);
}

function formatDateTime(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  if (Number.isNaN(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(time);
}
