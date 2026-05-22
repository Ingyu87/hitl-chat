import type { SessionConfig } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER } from "@/lib/question-flow";

export const STAGES = STAGE_ORDER.map((stage) => ({
  stage,
  label: STAGE_LABELS[stage]
}));

export const DEFAULT_SESSION: SessionConfig = {
  id: "session-demo",
  title: "생각잇기 프롬프트 수업",
  topic: "교실 속 안전한 생성형 AI 활용",
  learningGoal: "학생이 주제에 맞는 자기 생각을 구체화하고, 생성형 AI에 넣을 수 있는 명확한 프롬프트를 완성한다.",
  outputType: "이미지 생성 프롬프트",
  requiredElements: ["장소", "주요 대상", "문제 해결 방법"],
  constraints: ["주제와 무관한 내용 제외", "혐오 표현 금지", "학생이 말하지 않은 핵심 아이디어 임의 추가 금지"],
  questionFlow: [],
  lessonDesigned: false,
  maxLoopCount: 3,
  aiEnabled: true,
  aiProvider: "gemini",
  aiUsagePolicy: "questions_and_prompts",
  aiCallsPerStudentLimit: 8,
  accessCode: "HITL35",
  isActive: false,
  revision: 1,
  updatedAt: new Date(0).toISOString()
};
