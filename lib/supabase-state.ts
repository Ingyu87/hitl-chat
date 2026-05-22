import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const STATE_ID = "main";

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function loadAppState<T>() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_state")
    .select("state")
    .eq("id", STATE_ID)
    .maybeSingle();

  if (error) {
    console.warn("Could not load Supabase app state:", error.message);
    return null;
  }

  return (data?.state as T | undefined) ?? null;
}

export async function saveAppState(state: unknown) {
  if (!supabase) return;

  const { error } = await supabase.from("app_state").upsert({
    id: STATE_ID,
    state,
    updated_at: new Date().toISOString()
  });

  if (error) {
    console.warn("Could not save Supabase app state:", error.message);
  }
}
