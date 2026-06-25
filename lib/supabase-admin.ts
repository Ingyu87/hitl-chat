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

export function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(CONFIGURATION_ERROR);
  }
  return supabaseAdmin;
}
