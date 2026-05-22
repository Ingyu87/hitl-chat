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
  title: "생각잇기 프롬프트",
  topic: "기후 위기를 줄이는 미래 도시",
  learningGoal: "학생이 주제에 맞는 아이디어를 구체화하고, 생성형 AI에 넣을 수 있는 명확한 프롬프트를 완성한다.",
  outputType: "이미지 생성 프롬프트",
  requiredElements: ["장소", "주요 대상", "문제 해결 방법", "분위기"],
  constraints: ["수업 주제와 무관한 내용 제외", "위험하거나 혐오적인 표현 제외", "학생이 말하지 않은 핵심 아이디어 임의 추가 금지"],
  questionFlow: [
    {
      stage: "orient",
      label: "주제 이해",
      question: "오늘 주제는 \"기후 위기를 줄이는 미래 도시\"야. 이 주제를 들었을 때 가장 먼저 떠오르는 생각을 한 문장으로 말해줘."
    },
    {
      stage: "explore",
      label: "아이디어 탐색",
      question: "미래 도시 안에서 특히 다루고 싶은 장면이나 문제는 무엇이니?"
    },
    {
      stage: "concrete",
      label: "구체화",
      question: "그 장면에는 어떤 장소, 사람, 물건, 해결 방법이 들어가면 좋을까?"
    },
    {
      stage: "describe",
      label: "조건 묘사",
      question: "색감, 분위기, 시점, 반드시 보였으면 하는 요소를 더 자세히 말해줘."
    },
    {
      stage: "draft",
      label: "초안 생성",
      question: "좋아. 지금까지 답을 모아 프롬프트 초안을 만들어볼게."
    },
    {
      stage: "revise",
      label: "수정",
      question: "초안을 읽고 바꾸고 싶은 점을 말해줘. 괜찮으면 이걸로 확정한다고 말하면 돼."
    },
    {
      stage: "final",
      label: "최종 승인",
      question: "최종 프롬프트가 저장되었어."
    }
  ],
  maxLoopCount: 3,
  aiEnabled: false,
  aiProvider: "gemini",
  aiUsagePolicy: "questions_and_prompts",
  aiCallsPerStudentLimit: 8,
  accessCode: "HITL35",
  isActive: true
};
