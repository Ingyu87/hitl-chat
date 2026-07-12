export type Stage = string;

export type AiProvider = "gemini" | "upstage";

export type AiPurpose = "question_polish" | "draft_prompt" | "revise_prompt" | "safety_check" | "teacher_analysis";

export type PromptSource = "rule" | "ai_assisted" | "student_revision";

export type SessionConfig = {
  id: string;
  title: string;
  topic: string;
  learningGoal: string;
  outputType: string;
  requiredElements: string[];
  constraints: string[];
  questionFlow: LessonQuestion[];
  lessonDesigned?: boolean;
  maxLoopCount: number;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiUsagePolicy: "questions_and_prompts";
  aiCallsPerStudentLimit: number;
  accessCode: string;
  unlockCode?: string;
  isActive: boolean;
  revision?: number;
  updatedAt?: string;
};

export type QuestionChoice = {
  label: string;
  value: string;
  description?: string;
};

export type LessonQuestion = {
  stage: Stage;
  label: string;
  question: string;
  choices?: QuestionChoice[];
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
  alertType: "paste_attempt" | "profanity" | "sexual" | "abusive" | "off_topic" | "meaningless";
  attemptedContent: string;
  reason?: string;
  isRead: boolean;
  createdAt: string;
};

export type StudentAnalysis = {
  summary: string;
  conceptUnderstanding: string;
  strengths: string[];
  misconceptions: string[];
  teacherRecommendations: string[];
  nextQuestions: string[];
  createdAt: string;
};

export type AiAssistLog = {
  id: string;
  provider: AiProvider;
  purpose: AiPurpose;
  stage: Stage;
  used: boolean;
  fallbackReason?: string;
  createdAt: string;
};

export type StudentWorkspace = {
  id: string;
  sessionId?: string;
  lessonTopic?: string;
  name: string;
  accessCode: string;
  clientToken?: string;
  joinedRevision?: number;
  currentStage: Stage;
  lastActiveAt: string;
  messages: ChatMessage[];
  prompts: PromptRecord[];
  safetyAlerts: SafetyAlert[];
  aiLogs: AiAssistLog[];
  analysis?: StudentAnalysis;
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
