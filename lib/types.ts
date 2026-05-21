export type Stage = "orient" | "explore" | "concrete" | "describe" | "draft" | "revise" | "final";

export type AiPurpose = "question_polish" | "draft_prompt" | "revise_prompt";

export type PromptSource = "rule" | "ai_assisted" | "student_revision";

export type SessionConfig = {
  id: string;
  title: string;
  topic: string;
  learningGoal: string;
  outputType: string;
  requiredElements: string[];
  constraints: string[];
  questionFlow: { stage: Stage; label: string; question: string }[];
  maxLoopCount: number;
  aiEnabled: boolean;
  aiProvider: "gemini";
  aiUsagePolicy: "questions_and_prompts";
  aiCallsPerStudentLimit: number;
  accessCode: string;
  isActive: boolean;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  stage: Stage;
  createdAt: string;
};

export type PromptRecord = {
  id: string;
  version: number;
  content: string;
  isFinal: boolean;
  loopCount: number;
  source: PromptSource;
  createdAt: string;
};

export type SafetyAlert = {
  id: string;
  alertType: "paste_attempt" | "profanity" | "off_topic" | "meaningless";
  attemptedContent: string;
  isRead: boolean;
  createdAt: string;
};

export type AiAssistLog = {
  id: string;
  provider: "gemini";
  purpose: AiPurpose;
  stage: Stage;
  used: boolean;
  fallbackReason?: string;
  createdAt: string;
};

export type StudentWorkspace = {
  id: string;
  name: string;
  accessCode: string;
  currentStage: Stage;
  lastActiveAt: string;
  messages: ChatMessage[];
  prompts: PromptRecord[];
  safetyAlerts: SafetyAlert[];
  aiLogs: AiAssistLog[];
};

export type FlowResult = {
  nextStage: Stage;
  assistantMessage: string;
  draftPrompt?: string;
  shouldCreatePrompt: boolean;
  promptSource?: PromptSource;
  aiPurpose?: AiPurpose;
  isFinal?: boolean;
};

export type AiAssistResult = {
  text: string;
  used: boolean;
  fallbackReason?: string;
};
