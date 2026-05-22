import { createClient, type User } from "@supabase/supabase-js";
import { DEFAULT_SESSION } from "@/lib/defaults";
import type { SessionConfig, StudentWorkspace } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseBrowser =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

type SessionRow = {
  id: string;
  teacher_id: string | null;
  title: string;
  topic: string;
  learning_goal: string;
  output_type: string;
  access_code: string;
  required_elements: string[];
  constraints: string[];
  question_flow: SessionConfig["questionFlow"];
  ai_enabled: boolean;
  ai_calls_per_student_limit: number;
  max_loop_count: number;
  lesson_designed: boolean;
  is_active: boolean;
  revision: number;
  updated_at: string;
};

type StudentRow = {
  id: string;
  session_id: string;
  name: string;
  access_code: string;
  current_stage: StudentWorkspace["currentStage"];
  joined_revision: number;
  messages: StudentWorkspace["messages"];
  prompts: StudentWorkspace["prompts"];
  safety_alerts: StudentWorkspace["safetyAlerts"];
  ai_logs: StudentWorkspace["aiLogs"];
  analysis: StudentWorkspace["analysis"] | null;
  last_active_at: string;
};

export function isSupabaseReady() {
  return Boolean(supabaseBrowser);
}

export async function getCurrentTeacher() {
  if (!supabaseBrowser) return null;
  const { data } = await supabaseBrowser.auth.getUser();
  return data.user;
}

export async function signInTeacher(email: string, password: string) {
  if (!supabaseBrowser) throw new Error("Supabase 환경변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인해 주세요.");
  const { data, error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
  if (error) throw new Error(toAuthMessage(error.message));
  return data.user;
}

export async function signUpTeacher(email: string, password: string) {
  if (!supabaseBrowser) throw new Error("Supabase 환경변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 확인해 주세요.");
  const { data, error } = await supabaseBrowser.auth.signUp({ email, password });
  if (error) throw new Error(toAuthMessage(error.message));
  if (!data.session) return null;
  return data.user;
}

function toAuthMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (normalized.includes("password")) return "비밀번호가 너무 약하거나 형식이 맞지 않습니다. 6자 이상으로 입력해 주세요.";
  if (normalized.includes("invalid email")) return "올바른 이메일 주소를 입력해 주세요.";
  if (normalized.includes("email not confirmed")) return "이메일 인증이 필요합니다. 메일함을 확인한 뒤 로그인해 주세요.";
  if (normalized.includes("invalid login credentials")) return "이메일 또는 비밀번호를 확인해 주세요.";
  return message || "인증 처리 중 오류가 발생했습니다.";
}

export async function signOutTeacher() {
  if (!supabaseBrowser) return;
  await supabaseBrowser.auth.signOut();
}

export async function loadTeacherData(user: User) {
  if (!supabaseBrowser) return { session: DEFAULT_SESSION, students: [] };

  const { data: sessionRows, error: sessionError } = await supabaseBrowser
    .from("sessions")
    .select("*")
    .eq("teacher_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (sessionError) throw sessionError;

  const session = sessionRows?.[0] ? rowToSession(sessionRows[0] as SessionRow) : createEmptySession();
  const students = sessionRows?.[0] ? await loadStudentsForSession(session.id) : [];

  return { session, students };
}

export async function loadStudentsForSession(sessionId: string) {
  if (!supabaseBrowser) return [];
  const { data, error } = await supabaseBrowser
    .from("students")
    .select("*")
    .eq("session_id", sessionId)
    .order("last_active_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => rowToStudent(row as StudentRow));
}

export async function saveTeacherSession(session: SessionConfig, user: User) {
  if (!supabaseBrowser) return session;
  const row = sessionToRow(session, user.id);
  const { data, error } = await supabaseBrowser
    .from("sessions")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

export async function deleteStudentRow(studentId: string) {
  if (!supabaseBrowser) return;
  const { error } = await supabaseBrowser.from("students").delete().eq("id", studentId);
  if (error) throw error;
}

export async function clearStudentRows(sessionId: string) {
  if (!supabaseBrowser) return;
  const { error } = await supabaseBrowser.from("students").delete().eq("session_id", sessionId);
  if (error) throw error;
}

export function createEmptySession(): SessionConfig {
  return {
    ...DEFAULT_SESSION,
    id: crypto.randomUUID(),
    accessCode: createAccessCode(),
    updatedAt: new Date().toISOString()
  };
}

function rowToSession(row: SessionRow): SessionConfig {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    learningGoal: row.learning_goal,
    outputType: row.output_type,
    accessCode: row.access_code,
    requiredElements: row.required_elements ?? [],
    constraints: row.constraints ?? [],
    questionFlow: row.question_flow ?? [],
    aiEnabled: row.ai_enabled,
    aiProvider: "gemini",
    aiUsagePolicy: "questions_and_prompts",
    aiCallsPerStudentLimit: row.ai_calls_per_student_limit,
    maxLoopCount: row.max_loop_count,
    lessonDesigned: row.lesson_designed,
    isActive: row.is_active,
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

function sessionToRow(session: SessionConfig, teacherId: string) {
  return {
    id: isUuid(session.id) ? session.id : crypto.randomUUID(),
    teacher_id: teacherId,
    title: session.title || session.topic || "HITL 수업",
    topic: session.topic,
    learning_goal: session.learningGoal,
    output_type: session.outputType,
    access_code: session.accessCode || createAccessCode(),
    required_elements: session.requiredElements ?? [],
    constraints: session.constraints ?? [],
    question_flow: session.questionFlow ?? [],
    ai_enabled: session.aiEnabled,
    ai_calls_per_student_limit: session.aiCallsPerStudentLimit,
    max_loop_count: session.maxLoopCount,
    lesson_designed: Boolean(session.lessonDesigned),
    is_active: session.isActive,
    revision: session.revision ?? 1
  };
}

function rowToStudent(row: StudentRow): StudentWorkspace {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    accessCode: row.access_code,
    joinedRevision: row.joined_revision,
    currentStage: row.current_stage,
    lastActiveAt: row.last_active_at,
    messages: row.messages ?? [],
    prompts: row.prompts ?? [],
    safetyAlerts: row.safety_alerts ?? [],
    aiLogs: row.ai_logs ?? [],
    analysis: row.analysis ?? undefined
  };
}

function createAccessCode() {
  return `HITL${Math.floor(1000 + Math.random() * 9000)}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
