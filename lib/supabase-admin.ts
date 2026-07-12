import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIGURATION_ERROR =
  "Supabase 환경변수가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.";

export const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

export function getSupabaseAdminConfigStatus() {
  return {
    hasUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    isConfigured: Boolean(supabaseAdmin)
  };
}

export function getSupabaseAdminConfigError() {
  return supabaseAdmin ? null : CONFIGURATION_ERROR;
}

export async function getTeacherFromAuthHeader(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}
