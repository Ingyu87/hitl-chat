import { requireSupabaseAdmin } from "@/lib/supabase-admin";

type DeleteBody = {
  studentId?: string;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as DeleteBody;
  const studentId = body.studentId;

  if (!studentId) {
    return Response.json({ error: "삭제할 학생 정보가 없습니다." }, { status: 400 });
  }

  const supabase = requireSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return Response.json({ error: userError?.message ?? "로그인 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const { data: studentRow, error: studentError } = await supabase
    .from("students")
    .select("id, session_id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    return Response.json({ error: studentError.message }, { status: 500 });
  }

  if (!studentRow) {
    return Response.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", studentRow.session_id)
    .eq("teacher_id", userData.user.id)
    .maybeSingle();

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  if (!sessionRow) {
    return Response.json({ error: "이 학생을 삭제할 권한이 없습니다." }, { status: 403 });
  }

  const { error: deleteError, count } = await supabase
    .from("students")
    .delete({ count: "exact" })
    .eq("id", studentId);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({ deleted: count ?? 0 });
}
