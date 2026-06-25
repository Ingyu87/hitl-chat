import { getSupabaseAdminConfigError, getSupabaseAdminConfigStatus, supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const config = getSupabaseAdminConfigStatus();
  const configError = getSupabaseAdminConfigError();

  if (configError || !supabaseAdmin) {
    return Response.json(
      {
        ok: false,
        supabase: {
          ...config,
          reachable: false,
          error: configError ?? "Supabase 연결을 초기화하지 못했습니다."
        }
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const startedAt = Date.now();
  const { error } = await supabaseAdmin.from("sessions").select("id", { count: "exact", head: true }).limit(1);

  if (error) {
    return Response.json(
      {
        ok: false,
        supabase: {
          ...config,
          reachable: false,
          latencyMs: Date.now() - startedAt,
          error: error.message
        }
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    {
      ok: true,
      supabase: {
        ...config,
        reachable: true,
        latencyMs: Date.now() - startedAt
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
