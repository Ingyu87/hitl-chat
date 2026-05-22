import type { SessionConfig, Stage } from "@/lib/types";

export const STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe", "draft", "revise", "final"];

export const STAGE_LABELS: Record<Stage, string> = {
  orient: "주제 연결",
  explore: "아이디어 확장",
  concrete: "구체화",
  describe: "시각 스타일",
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
    orient: `${TOPIC_TOKEN}을 이미지로 표현하기 위해 학생이 먼저 떠올린 장면, 의미, 문제의식을 말하게 이끈다.`,
    explore: `학생 답변을 바탕으로 ${TOPIC_TOKEN} 안에 들어갈 장소, 사람, 상황, 사건을 더 넓혀 묻는다.`,
    concrete: "학생 아이디어를 이미지 프롬프트로 쓸 수 있게 장소, 주요 대상, 행동, 문제/해결 방법을 구체화하게 한다.",
    describe: "색감, 분위기, 구도, 카메라 시점, 화풍/스타일(예: 사진풍, 수채화, 만화풍, 포스터풍 등), 반드시 보여야 할 시각 요소를 묻는다.",
    draft: `지금까지의 학생 답변만 바탕으로 ${outputType} 초안을 생성한다.`,
    revise: "초안을 보여준 뒤 추가, 삭제, 변경, 더 명확하게 만들 부분을 묻는다.",
    final: "학생이 최종 프롬프트를 확정할지 확인한다."
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
