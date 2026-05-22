create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id),
  title text not null default '프롬프트 빌더 수업',
  topic text not null,
  learning_goal text not null,
  output_type text not null default '이미지 생성 프롬프트',
  required_elements text[] not null default array[]::text[],
  constraints text[] not null default array[]::text[],
  question_flow jsonb not null default '[]'::jsonb,
  max_loop_count int not null default 3,
  ai_enabled boolean not null default false,
  ai_provider text not null default 'gemini',
  ai_usage_policy text not null default 'questions_and_prompts',
  ai_calls_per_student_limit int not null default 8,
  access_code text not null,
  is_active boolean not null default false,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  access_code text not null,
  current_stage text not null default 'orient',
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  role text not null check (role in ('assistant', 'user', 'system')),
  content text not null,
  stage text not null,
  created_at timestamptz not null default now()
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  version int not null default 1,
  content text not null,
  is_final boolean not null default false,
  loop_count int not null default 0,
  source text not null check (source in ('rule', 'ai_assisted', 'student_revision')),
  created_at timestamptz not null default now()
);

create table if not exists safety_alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  alert_type text not null check (alert_type in ('paste_attempt', 'profanity', 'off_topic', 'meaningless')),
  attempted_content text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ai_assist_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  provider text not null default 'gemini',
  purpose text not null check (purpose in ('question_polish', 'draft_prompt', 'revise_prompt')),
  stage text not null,
  used boolean not null default false,
  fallback_reason text,
  created_at timestamptz not null default now()
);

create table if not exists app_state (
  id text primary key default 'main',
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

drop policy if exists "Allow public app state read" on app_state;
drop policy if exists "Allow public app state write" on app_state;

create policy "Allow public app state read"
  on app_state
  for select
  to anon, authenticated
  using (true);

create policy "Allow public app state write"
  on app_state
  for all
  to anon, authenticated
  using (true)
  with check (true);
