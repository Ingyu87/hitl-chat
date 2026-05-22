import { getInitialAssistantMessage } from "@/lib/flow";
import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import type { SessionConfig, StudentWorkspace } from "@/lib/types";

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
  const student: StudentWorkspace =
    existing && !shouldReset
      ? rowToStudent(existing)
      : {
          id: existing?.id ?? crypto.randomUUID(),
          sessionId: session.id,
          name,
          accessCode: code,
          joinedRevision: session.revision ?? 1,
          currentStage: "orient",
          lastActiveAt: now,
          messages: [createAssistantMessage(getInitialAssistantMessage(session), "orient")],
          prompts: [],
          safetyAlerts: [],
          aiLogs: []
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
    aiCallsPerStudentLimit: row.ai_calls_per_student_limit,
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
