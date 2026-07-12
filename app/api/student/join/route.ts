import { getInitialAssistantMessage } from "@/lib/flow";
import { getInitialQuestionStage } from "@/lib/question-flow";
import { buildRestartMessages } from "@/lib/restart-marker";
import { sessionRowToConfig, studentRowToWorkspace, workspaceToStudentRow, type SessionDbRow, type StudentDbRow } from "@/lib/session-row";
import { getSupabaseAdminConfigError, supabaseAdmin } from "@/lib/supabase-admin";
import type { StudentWorkspace } from "@/lib/types";

type JoinBody = {
  code?: string;
  name?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as JoinBody;
  const code = body.code?.trim().toUpperCase();
  const name = body.name?.trim();

  if (!code || !name) {
    return Response.json({ error: "닉네임과 접속 코드를 입력해주세요." }, { status: 400 });
  }

  const configError = getSupabaseAdminConfigError();
  if (configError || !supabaseAdmin) {
    return Response.json({ error: configError ?? "Supabase 연결을 초기화하지 못했습니다." }, { status: 503 });
  }

  const supabase = supabaseAdmin;
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

  const session = sessionRowToConfig(sessionRow as SessionDbRow);
  const { data: existingRows } = await supabase
    .from("students")
    .select("*")
    .eq("session_id", session.id)
    .eq("access_code", code)
    .eq("name", name)
    .limit(1);

  // 기존 방식 유지: 닉네임 + 접속 코드만 있으면 어느 기기에서든 이어서 진행할 수 있다.
  // chat/save/unlock API에 필요한 학생 토큰은 이 응답으로 함께 전달된다.
  const existingRow = (existingRows?.[0] as StudentDbRow | undefined) ?? null;

  const now = new Date().toISOString();
  const initialStage = getInitialQuestionStage(session);
  const shouldReset = Boolean(existingRow && existingRow.joined_revision !== (session.revision ?? 1));
  const existingStudent = existingRow ? studentRowToWorkspace(existingRow, session.topic) : null;
  const greeting = createAssistantMessage(getInitialAssistantMessage(session), initialStage);
  const student: StudentWorkspace =
    existingStudent && !shouldReset
      ? existingStudent
      : {
          id: existingStudent?.id ?? crypto.randomUUID(),
          sessionId: session.id,
          lessonTopic: session.topic,
          name,
          accessCode: code,
          clientToken: existingStudent?.clientToken ?? crypto.randomUUID(),
          joinedRevision: session.revision ?? 1,
          currentStage: initialStage,
          lastActiveAt: now,
          messages: existingStudent ? buildRestartMessages(existingStudent, session, now, greeting) : [greeting],
          prompts: [],
          safetyAlerts: existingStudent?.safetyAlerts ?? [],
          aiLogs: existingStudent?.aiLogs ?? []
        };

  const { data: saved, error: saveError } = await supabase
    .from("students")
    .upsert(workspaceToStudentRow(student, session.id))
    .select("*")
    .single();

  if (saveError) {
    return Response.json({ error: saveError.message }, { status: 500 });
  }

  return Response.json({ session, student: studentRowToWorkspace(saved as StudentDbRow, session.topic) });
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
