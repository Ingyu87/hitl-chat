-- HITL Prompt Builder current production schema.
-- The app stores each student's chat state as JSONB columns on students.
-- The older normalized messages/prompts tables are intentionally not used by the current code.

create extension if not exists pgcrypto;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete set null,
  title text not null default 'HITL 수업',
  topic text not null default '',
  learning_goal text not null default '',
  output_type text not null default '이미지 생성 프롬프트',
  required_elements text[] not null default array[]::text[],
  constraints text[] not null default array[]::text[],
  question_flow jsonb not null default '[]'::jsonb,
  max_loop_count int not null default 3,
  ai_enabled boolean not null default true,
  ai_provider text not null default 'gemini',
  ai_usage_policy text not null default 'questions_and_prompts',
  ai_calls_per_student_limit int not null default 15,
  access_code text not null,
  lesson_designed boolean not null default false,
  is_active boolean not null default false,
  revision int not null default 1,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  access_code text not null,
  current_stage text not null default 'orient',
  joined_revision int not null default 1,
  messages jsonb not null default '[]'::jsonb,
  prompts jsonb not null default '[]'::jsonb,
  safety_alerts jsonb not null default '[]'::jsonb,
  ai_logs jsonb not null default '[]'::jsonb,
  analysis jsonb,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sessions add column if not exists lesson_designed boolean not null default false;
alter table sessions add column if not exists revision int not null default 1;
alter table sessions add column if not exists updated_at timestamptz not null default now();
alter table sessions alter column ai_calls_per_student_limit set default 15;
alter table sessions alter column ai_enabled set default true;

alter table students add column if not exists joined_revision int not null default 1;
alter table students add column if not exists messages jsonb not null default '[]'::jsonb;
alter table students add column if not exists prompts jsonb not null default '[]'::jsonb;
alter table students add column if not exists safety_alerts jsonb not null default '[]'::jsonb;
alter table students add column if not exists ai_logs jsonb not null default '[]'::jsonb;
alter table students add column if not exists analysis jsonb;
alter table students add column if not exists updated_at timestamptz not null default now();

create index if not exists sessions_teacher_updated_idx on sessions(teacher_id, updated_at desc);
create index if not exists sessions_access_code_idx on sessions(access_code);
create index if not exists students_session_last_active_idx on students(session_id, last_active_at desc);
create index if not exists students_session_code_name_idx on students(session_id, access_code, name);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sessions_set_updated_at on sessions;
create trigger sessions_set_updated_at
before update on sessions
for each row execute function set_updated_at();

drop trigger if exists students_set_updated_at on students;
create trigger students_set_updated_at
before update on students
for each row execute function set_updated_at();

-- MVP policy:
-- The app currently uses Supabase Auth on the client for teacher reads/writes
-- and service-role route handlers for student join/save. Full RLS hardening is
-- intentionally deferred until after classroom pilot stabilization.
