import { AI_ASSIST_LIMIT } from "@/lib/defaults";
import type { SessionConfig, StudentWorkspace } from "@/lib/types";

// 서버 라우트(join/chat/save/unlock)가 공유하는 DB row 매퍼.
// unlock_code는 학생 클라이언트에 노출되면 안 되므로 여기서는 매핑하지 않는다.

export type SessionDbRow = {
  id: string;
  title: string;
  topic: string;
  learning_goal: string;
  output_type: string;
  access_code: string;
  required_elements: string[] | null;
  constraints: string[] | null;
  question_flow: SessionConfig["questionFlow"] | null;
  ai_enabled: boolean;
  max_loop_count: number;
  lesson_designed: boolean;
  is_active: boolean;
  revision: number | null;
  updated_at: string;
};

export type StudentDbRow = {
  id: string;
  session_id: string;
  name: string;
  access_code: string;
  client_token: string | null;
  current_stage: string;
  joined_revision: number | null;
  messages: StudentWorkspace["messages"] | null;
  prompts: StudentWorkspace["prompts"] | null;
  safety_alerts: StudentWorkspace["safetyAlerts"] | null;
  ai_logs: StudentWorkspace["aiLogs"] | null;
  analysis: StudentWorkspace["analysis"] | null;
  last_active_at: string;
};

export function sessionRowToConfig(row: SessionDbRow): SessionConfig {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    learningGoal: row.learning_goal,
    outputType: row.output_type,
    requiredElements: row.required_elements ?? [],
    constraints: row.constraints ?? [],
    questionFlow: row.question_flow ?? [],
    lessonDesigned: row.lesson_designed,
    maxLoopCount: row.max_loop_count,
    aiEnabled: row.ai_enabled,
    aiProvider: "gemini",
    aiUsagePolicy: "questions_and_prompts",
    aiCallsPerStudentLimit: AI_ASSIST_LIMIT,
    accessCode: row.access_code,
    isActive: row.is_active,
    revision: row.revision ?? 1,
    updatedAt: row.updated_at
  };
}

export function studentRowToWorkspace(row: StudentDbRow, lessonTopic?: string): StudentWorkspace {
  return {
    id: row.id,
    sessionId: row.session_id,
    lessonTopic,
    name: row.name,
    accessCode: row.access_code,
    clientToken: row.client_token ?? undefined,
    joinedRevision: row.joined_revision ?? 1,
    currentStage: row.current_stage,
    lastActiveAt: row.last_active_at,
    messages: row.messages ?? [],
    prompts: row.prompts ?? [],
    safetyAlerts: row.safety_alerts ?? [],
    aiLogs: row.ai_logs ?? [],
    analysis: row.analysis ?? undefined
  };
}

export function workspaceToStudentRow(student: StudentWorkspace, sessionId: string) {
  return {
    id: student.id,
    session_id: sessionId,
    name: student.name,
    access_code: student.accessCode,
    client_token: student.clientToken,
    current_stage: student.currentStage,
    joined_revision: student.joinedRevision ?? 1,
    messages: student.messages,
    prompts: student.prompts,
    safety_alerts: student.safetyAlerts,
    ai_logs: student.aiLogs,
    analysis: student.analysis ?? null,
    last_active_at: student.lastActiveAt
  };
}
