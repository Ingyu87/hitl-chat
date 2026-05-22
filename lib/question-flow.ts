import type { SessionConfig, Stage } from "@/lib/types";

export const STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe", "draft", "revise", "final"];

export const STAGE_LABELS: Record<Stage, string> = {
  orient: "대화 시작",
  explore: "생각 넓히기",
  concrete: "구체화",
  describe: "표현 정리",
  draft: "초안 만들기",
  revise: "수정 대화",
  final: "최종 확인"
};

const TOPIC_TOKEN = "{{topic}}";

export function injectTopic(text: string, config: Pick<SessionConfig, "topic">) {
  return text.replace(/\{\{topic\}\}/g, config.topic.trim() || "이번 주제");
}

export function normalizeQuestionText(text: string, config: Pick<SessionConfig, "topic">) {
  return injectTopic(text, config).replace(/\s+/g, " ").trim();
}

export function buildDefaultQuestionFlow(config: Pick<SessionConfig, "topic" | "outputType">) {
  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    question: defaultQuestionTemplate(stage, config)
  }));
}

export function getQuestionForStage(config: SessionConfig, stage: Stage) {
  const custom = config.questionFlow.find((item) => item.stage === stage)?.question;
  return normalizeQuestionText(custom || defaultQuestionTemplate(stage, config), config);
}

export function defaultQuestionTemplate(stage: Stage, config: Pick<SessionConfig, "outputType">) {
  const outputType = config.outputType || "이미지 생성 프롬프트";

  return {
    orient: `좋아요. ${TOPIC_TOKEN}에 대해 이야기해볼게요. 이 주제를 이미지로 표현한다면, 가장 먼저 어떤 생각이나 장면이 떠오르나요?`,
    explore: `방금 말한 생각을 조금 더 넓혀볼게요. ${TOPIC_TOKEN} 안에서 어떤 장소, 사람, 사건, 분위기가 함께 보이면 좋을까요?`,
    concrete: "좋습니다. 그 장면을 더 선명하게 만들어볼게요. 어디에서, 누가, 무엇을 하고 있고, 어떤 문제가 있거나 어떤 변화가 일어나고 있나요?",
    describe: "이제 이미지가 눈에 보이도록 정리해볼게요. 색감, 분위기, 시점, 스타일, 꼭 들어가야 하는 요소를 말해줄래요?",
    draft: `지금까지의 답을 바탕으로 ${outputType} 초안을 만들어볼게요.`,
    revise: "초안을 보고 더 넣고 싶은 것, 빼고 싶은 것, 바꾸고 싶은 표현이 있나요? 그대로 확정해도 됩니다.",
    final: "좋아요. 이 내용으로 최종 프롬프트를 확정할까요?"
  }[stage];
}

export function sanitizeQuestionFlow(config: SessionConfig) {
  const incoming = new Map(config.questionFlow.map((item) => [item.stage, item]));

  return STAGE_ORDER.map((stage) => {
    const item = incoming.get(stage);
    return {
      stage,
      label: item?.label || STAGE_LABELS[stage],
      question: item?.question?.trim() || defaultQuestionTemplate(stage, config)
    };
  });
}
