import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import type { StudentWorkspace } from "@/lib/types";

type SaveBody = {
  student: StudentWorkspace;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SaveBody;
  const student = body.student;

  if (!student?.id || !student.sessionId) {
    return Response.json({ error: "학생 저장 정보가 부족합니다." }, { status: 400 });
  }

  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("students")
    .upsert({
      id: student.id,
      session_id: student.sessionId,
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
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ student: data });
}
