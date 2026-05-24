import { getInitialAssistantMessage } from "@/lib/flow";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import type { ChatMessage, SessionConfig, StudentWorkspace } from "@/lib/types";

const AI_ASSIST_LIMIT = 30;
const RESTART_MARKER_PREFIX = "__HITL_RESTART__:";

type JoinBody = {
  code: string;
  name: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as JoinBody;
  const code = body.code?.trim().toUpperCase();
  const name = body.name?.trim();

  if (!code || !name) {
    return Response.json({ error: "이름과 접속 코드를 입력해주세요." }, { status: 400 });
  }

  const supabase = requireSupabaseAdmin();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("access_code", code)
    .eq("is_active", true)
    .eq("lesson_designed", true)
    .maybeSingle();

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  if (!sessionRow) {
    return Response.json({ error: "활성화된 수업을 찾을 수 없어요. 선생님이 공유한 링크와 코드를 확인해주세요." }, { status: 404 });
  }

  const session = rowToSession(sessionRow);
  const { data: existingRows } = await supabase
    .from("students")
    .select("*")
    .eq("session_id", session.id)
    .eq("access_code", code)
    .eq("name", name)
    .limit(1);

  const existing = existingRows?.[0];
  const now = new Date().toISOString();
  const shouldReset = Boolean(existing && existing.joined_revision !== (session.revision ?? 1));
  const existingStudent = existing ? { ...rowToStudent(existing), lessonTopic: session.topic } : null;
  const student: StudentWorkspace =
    existingStudent && !shouldReset
      ? existingStudent
      : {
          id: existingStudent?.id ?? crypto.randomUUID(),
          sessionId: session.id,
          lessonTopic: session.topic,
          name,
          accessCode: code,
          joinedRevision: session.revision ?? 1,
          currentStage: "orient",
          lastActiveAt: now,
          messages: [
            ...(existingStudent ? existingStudent.messages : []),
            ...(existingStudent ? [createRestartMarkerMessage(existingStudent, session, now)] : []),
            createAssistantMessage(getInitialAssistantMessage(session), "orient")
          ],
          prompts: [],
          safetyAlerts: existingStudent?.safetyAlerts ?? [],
          aiLogs: existingStudent?.aiLogs ?? []
        };

  const { data: saved, error: saveError } = await supabase
    .from("students")
    .upsert(studentToRow(student, session.id))
    .select("*")
    .single();

  if (saveError) {
    return Response.json({ error: saveError.message }, { status: 500 });
  }

  return Response.json({ session, student: rowToStudent(saved) });
}

function createAssistantMessage(content: string, stage: StudentWorkspace["currentStage"]) {
  return {
    id: crypto.randomUUID(),
    role: "assistant" as const,
    content,
    stage,
    createdAt: new Date().toISOString()
  };
}

function createRestartMarkerMessage(student: StudentWorkspace, session: SessionConfig, createdAt: string): ChatMessage {
  const snapshot = {
    id: crypto.randomUUID(),
    topic: student.lessonTopic ?? session.topic,
    createdAt,
    stage: student.currentStage,
    messages: getActiveMessages(student.messages),
    prompts: student.prompts
  };

  return {
    id: crypto.randomUUID(),
    role: "system" as const,
    content: `${RESTART_MARKER_PREFIX}${JSON.stringify(snapshot)}`,
    stage: student.currentStage,
    createdAt
  };
}

function isRestartMarker(message: ChatMessage) {
  return message.role === "system" && message.content.startsWith(RESTART_MARKER_PREFIX);
}

function getActiveMessages(messages: ChatMessage[]) {
  let lastRestartIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isRestartMarker(messages[index])) {
      lastRestartIndex = index;
      break;
    }
  }
  return messages.slice(lastRestartIndex + 1).filter((message) => message.role !== "system");
}

function rowToSession(row: any): SessionConfig {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    learningGoal: row.learning_goal,
    outputType: row.output_type,
    requiredElements: row.required_elements ?? [],
    constraints: row.constraints ?? [],
    questionFlow: row.question_flow ?? [],
    lessonDesigned: row.lesson_designed,
    maxLoopCount: row.max_loop_count,
    aiEnabled: row.ai_enabled,
    aiProvider: "gemini",
    aiUsagePolicy: "questions_and_prompts",
    aiCallsPerStudentLimit: AI_ASSIST_LIMIT,
    accessCode: row.access_code,
    isActive: row.is_active,
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

function rowToStudent(row: any): StudentWorkspace {
  return {
    id: row.id,
    sessionId: row.session_id,
    lessonTopic: row.topic,
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

function studentToRow(student: StudentWorkspace, sessionId: string) {
  return {
    id: student.id,
    session_id: sessionId,
    name: student.name,
    access_code: student.accessCode,
    current_stage: student.currentStage,
    joined_revision: student.joinedRevision ?? 1,
    messages: student.messages,
    prompts: student.prompts,
    safety_alerts: student.safetyAlerts,
    ai_logs: student.aiLogs,
    analysis: student.analysis ?? null,
    last_active_at: student.lastActiveAt
  };
}
