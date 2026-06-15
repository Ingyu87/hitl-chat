import { requireSupabaseAdmin } from "@/lib/supabase-admin";
import type { AiAssistLog, ChatMessage, PromptRecord, SafetyAlert, StudentAnalysis, StudentWorkspace } from "@/lib/types";

type SaveBody = {
  student: StudentWorkspace;
};

const AI_ASSIST_LIMIT = 15;
const MAX_MESSAGES = 140;
const MAX_PROMPTS = 30;
const MAX_SAFETY_ALERTS = 50;
const MAX_AI_LOGS = 160;
const MAX_MESSAGE_LENGTH = 20000;
const MAX_PROMPT_LENGTH = 800;
const MAX_ALERT_CONTENT_LENGTH = 800;
const MAX_ANALYSIS_TEXT_LENGTH = 1200;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<SaveBody>;
  const student = body.student;

  if (!student?.id || !student.sessionId) {
    return Response.json({ error: "학생 저장 정보가 부족합니다." }, { status: 400 });
  }

  const supabase = requireSupabaseAdmin();
  const { data: sessionRow, error: sessionError } = await supabase
    .from("sessions")
    .select("id, access_code, is_active, lesson_designed, question_flow")
    .eq("id", student.sessionId)
    .maybeSingle();

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  if (!sessionRow) {
    return Response.json({ error: "저장할 수업을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!sessionRow.lesson_designed) {
    return Response.json({ error: "질문 흐름이 승인된 수업만 저장할 수 있습니다." }, { status: 403 });
  }

  if (normalizeCode(student.accessCode) !== normalizeCode(sessionRow.access_code as string)) {
    return Response.json({ error: "학생 접속 코드가 수업 코드와 일치하지 않습니다." }, { status: 403 });
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("students")
    .select("id, session_id, name, access_code, last_active_at")
    .eq("id", student.id)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: existingError.message }, { status: 500 });
  }

  if (!existingRow) {
    return Response.json({ error: "학생 입장 기록이 없습니다. 다시 입장해 주세요." }, { status: 404 });
  }

  if (existingRow.session_id !== student.sessionId || normalizeCode(existingRow.access_code as string) !== normalizeCode(student.accessCode)) {
    return Response.json({ error: "학생 기록이 현재 수업과 일치하지 않습니다." }, { status: 403 });
  }

  const validation = validateStudentPayload(student, getAllowedStages(sessionRow.question_flow));
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  if (isServerRecordNewer(existingRow.last_active_at as string | undefined, student.lastActiveAt)) {
    return Response.json({ skipped: true });
  }

  const { data, error } = await supabase
    .from("students")
    .update({
      id: student.id,
      session_id: student.sessionId,
      name: String(existingRow.name || student.name).trim(),
      access_code: sessionRow.access_code,
      current_stage: student.currentStage,
      joined_revision: student.joinedRevision ?? 1,
      messages: student.messages,
      prompts: student.prompts,
      safety_alerts: student.safetyAlerts,
      ai_logs: student.aiLogs,
      analysis: student.analysis ?? null,
      last_active_at: student.lastActiveAt
    })
    .eq("id", student.id)
    .eq("session_id", student.sessionId)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ student: data });
}

function normalizeCode(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function isServerRecordNewer(serverLastActiveAt: string | undefined, incomingLastActiveAt: string) {
  const serverTime = Date.parse(serverLastActiveAt ?? "");
  const incomingTime = Date.parse(incomingLastActiveAt);
  return Number.isFinite(serverTime) && Number.isFinite(incomingTime) && serverTime > incomingTime;
}

function getAllowedStages(questionFlow: unknown) {
  const stages = new Set(["orient", "explore", "concrete", "describe", "draft", "revise", "final"]);
  if (Array.isArray(questionFlow)) {
    for (const item of questionFlow) {
      const stage = typeof item === "object" && item && "stage" in item ? String((item as { stage?: unknown }).stage ?? "").trim() : "";
      if (stage) stages.add(stage);
    }
  }
  return stages;
}

function validateStudentPayload(student: StudentWorkspace, allowedStages: Set<string>): { ok: true } | { ok: false; error: string } {
  if (!isUuid(student.id) || !isUuid(student.sessionId ?? "")) return { ok: false, error: "학생 또는 수업 식별자가 올바르지 않습니다." };
  if (!String(student.name ?? "").trim()) return { ok: false, error: "학생 이름이 비어 있습니다." };
  if (!allowedStages.has(String(student.currentStage ?? ""))) return { ok: false, error: "현재 단계 정보가 올바르지 않습니다." };
  if (!isValidIsoDate(student.lastActiveAt)) return { ok: false, error: "최근 활동 시간이 올바르지 않습니다." };

  if (!Array.isArray(student.messages) || student.messages.length > MAX_MESSAGES) return { ok: false, error: "대화 기록이 너무 많습니다." };
  if (!Array.isArray(student.prompts) || student.prompts.length > MAX_PROMPTS) return { ok: false, error: "프롬프트 기록이 너무 많습니다." };
  if (!Array.isArray(student.safetyAlerts) || student.safetyAlerts.length > MAX_SAFETY_ALERTS) return { ok: false, error: "경고 기록이 너무 많습니다." };
  if (!Array.isArray(student.aiLogs) || student.aiLogs.length > MAX_AI_LOGS) return { ok: false, error: "AI 사용 기록이 너무 많습니다." };
  if (student.aiLogs.filter((log) => log?.used).length > AI_ASSIST_LIMIT) return { ok: false, error: "학생당 AI 보조 한도를 초과했습니다." };

  if (!student.messages.every((message) => isValidMessage(message, allowedStages))) return { ok: false, error: "대화 기록 형식이 올바르지 않습니다." };
  if (!student.prompts.every(isValidPrompt)) return { ok: false, error: "프롬프트 기록 형식이 올바르지 않습니다." };
  if (!student.safetyAlerts.every(isValidSafetyAlert)) return { ok: false, error: "경고 기록 형식이 올바르지 않습니다." };
  if (!student.aiLogs.every((log) => isValidAiLog(log, allowedStages))) return { ok: false, error: "AI 사용 기록 형식이 올바르지 않습니다." };
  if (student.analysis && !isValidAnalysis(student.analysis)) return { ok: false, error: "분석 기록 형식이 올바르지 않습니다." };

  return { ok: true };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidIsoDate(value: string) {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isShortString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength;
}

function isValidMessage(message: ChatMessage, allowedStages: Set<string>) {
  return (
    isUuid(message?.id) &&
    ["assistant", "user", "system"].includes(message.role) &&
    allowedStages.has(String(message.stage ?? "")) &&
    isShortString(message.content, MAX_MESSAGE_LENGTH) &&
    isValidIsoDate(message.createdAt)
  );
}

function isValidPrompt(prompt: PromptRecord) {
  return (
    isUuid(prompt?.id) &&
    Number.isInteger(prompt.version) &&
    prompt.version >= 1 &&
    isShortString(prompt.content, MAX_PROMPT_LENGTH) &&
    typeof prompt.isFinal === "boolean" &&
    Number.isInteger(prompt.loopCount) &&
    prompt.loopCount >= 0 &&
    ["rule", "ai_assisted", "student_revision"].includes(prompt.source) &&
    isValidIsoDate(prompt.createdAt)
  );
}

function isValidSafetyAlert(alert: SafetyAlert) {
  return (
    isUuid(alert?.id) &&
    ["paste_attempt", "profanity", "sexual", "abusive", "off_topic", "meaningless"].includes(alert.alertType) &&
    isShortString(alert.attemptedContent, MAX_ALERT_CONTENT_LENGTH) &&
    (alert.reason === undefined || isShortString(alert.reason, MAX_ALERT_CONTENT_LENGTH)) &&
    typeof alert.isRead === "boolean" &&
    isValidIsoDate(alert.createdAt)
  );
}

function isValidAiLog(log: AiAssistLog, allowedStages: Set<string>) {
  return (
    isUuid(log?.id) &&
    ["gemini", "upstage"].includes(log.provider) &&
    ["question_polish", "draft_prompt", "revise_prompt", "safety_check", "teacher_analysis"].includes(log.purpose) &&
    allowedStages.has(String(log.stage ?? "")) &&
    typeof log.used === "boolean" &&
    (log.fallbackReason === undefined || isShortString(log.fallbackReason, 200)) &&
    isValidIsoDate(log.createdAt)
  );
}

function isValidAnalysis(analysis: StudentAnalysis) {
  return (
    isShortString(analysis.summary, MAX_ANALYSIS_TEXT_LENGTH) &&
    isShortString(analysis.conceptUnderstanding, MAX_ANALYSIS_TEXT_LENGTH) &&
    isShortStringArray(analysis.strengths) &&
    isShortStringArray(analysis.misconceptions) &&
    isShortStringArray(analysis.teacherRecommendations) &&
    isShortStringArray(analysis.nextQuestions) &&
    isValidIsoDate(analysis.createdAt)
  );
}

function isShortStringArray(items: unknown) {
  return Array.isArray(items) && items.length <= 30 && items.every((item) => isShortString(item, MAX_ANALYSIS_TEXT_LENGTH));
}
