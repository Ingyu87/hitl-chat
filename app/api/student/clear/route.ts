import { requireSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = requireSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return Response.json({ error: userError?.message ?? "로그인 정보를 확인할 수 없습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { sessionId?: string };

  const sessionQuery = supabase
    .from("sessions")
    .select("id")
    .eq("teacher_id", userData.user.id);

  const { data: sessionRows, error: sessionError } = body.sessionId
    ? await sessionQuery.eq("id", body.sessionId)
    : await sessionQuery;

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  const sessionIds = (sessionRows ?? []).map((row) => row.id as string);
  if (!sessionIds.length) {
    return Response.json({ error: "삭제할 수업을 찾을 수 없습니다." }, { status: 404 });
  }

  const deleteQuery = supabase.from("students").delete({ count: "exact" });
  const { error: deleteError, count } = body.sessionId
    ? await deleteQuery.eq("session_id", body.sessionId)
    : await deleteQuery.in("session_id", sessionIds);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({ deleted: count ?? 0 });
}
