import { getSupabaseAdminConfigError, supabaseAdmin } from "@/lib/supabase-admin";

type UnlockBody = {
  studentId?: string;
  clientToken?: string;
  code?: string;
};

// 해제 코드는 세션 row에만 저장되고 학생 클라이언트에는 내려가지 않으므로,
// 잠금 해제 판정은 반드시 서버에서 수행한다.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as UnlockBody;
  const studentId = String(body.studentId ?? "").trim();
  const clientToken = String(body.clientToken ?? "").trim();
  const code = String(body.code ?? "").trim();

  if (!studentId || !clientToken || !code) {
    return Response.json({ error: "해제 코드를 입력해 주세요." }, { status: 400 });
  }

  const configError = getSupabaseAdminConfigError();
  if (configError || !supabaseAdmin) {
    return Response.json({ error: configError ?? "Supabase 연결을 초기화하지 못했습니다." }, { status: 503 });
  }

  const { data: studentRow, error: studentError } = await supabaseAdmin
    .from("students")
    .select("id, session_id, client_token")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError) {
    return Response.json({ error: studentError.message }, { status: 500 });
  }

  if (!studentRow) {
    return Response.json({ error: "학생 입장 기록이 없습니다. 다시 입장해 주세요." }, { status: 404 });
  }

  if (!studentRow.client_token || studentRow.client_token !== clientToken) {
    return Response.json({ error: "학생 인증 정보가 올바르지 않습니다. 다시 입장해 주세요." }, { status: 403 });
  }

  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("sessions")
    .select("id, unlock_code")
    .eq("id", studentRow.session_id)
    .maybeSingle();

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  if (!sessionRow?.unlock_code || sessionRow.unlock_code !== code) {
    return Response.json({ error: "해제 코드가 맞지 않습니다. 선생님께 다시 확인해 주세요." }, { status: 403 });
  }

  return Response.json({ ok: true });
}
