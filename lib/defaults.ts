import type { SessionConfig, Stage } from "@/lib/types";

export const STAGES: { stage: Stage; label: string }[] = [
  { stage: "orient", label: "주제 이해" },
  { stage: "explore", label: "아이디어 탐색" },
  { stage: "concrete", label: "구체화" },
  { stage: "describe", label: "조건 묘사" },
  { stage: "draft", label: "초안 생성" },
  { stage: "revise", label: "수정" },
  { stage: "final", label: "최종 승인" }
];

export const DEFAULT_SESSION: SessionConfig = {
  id: "session-demo",
  title: "기후 위기를 줄이는 미래 도시",
  topic: "기후 위기를 줄이는 미래 도시",
  learningGoal: "학생이 주제에 맞는 아이디어를 구체화하고, 생성형 AI에 넣을 수 있는 명확한 프롬프트를 완성한다.",
  outputType: "이미지 생성 프롬프트",
  requiredElements: [],
  constraints: [],
  questionFlow: [],
  lessonDesigned: false,
  maxLoopCount: 3,
  aiEnabled: true,
  aiProvider: "gemini",
  aiUsagePolicy: "questions_and_prompts",
  aiCallsPerStudentLimit: 8,
  accessCode: "HITL35",
  isActive: true
};
