import type { LessonQuestion, QuestionChoice, SessionConfig, Stage } from "@/lib/types";

export const MAX_QUESTION_COUNT = 50;

export const STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe", "draft", "revise", "final"];

export const STAGE_LABELS: Record<string, string> = {
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

export function buildDefaultQuestionFlow(config: Pick<SessionConfig, "topic" | "outputType">): LessonQuestion[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    question: defaultQuestionTemplate(stage, config),
    choices: defaultChoicesForStage(stage, config)
  }));
}

export function getQuestionForStage(config: SessionConfig, stage: Stage) {
  const flow = sanitizeQuestionFlow(config);
  const custom = flow.find((item) => item.stage === stage)?.question;
  return normalizeQuestionText(custom || defaultQuestionTemplate(stage, config), config);
}

export function getChoicesForStage(config: SessionConfig, stage: Stage): QuestionChoice[] {
  const flow = sanitizeQuestionFlow(config);
  const custom = flow.find((item) => item.stage === stage)?.choices;
  return normalizeChoices(custom && custom.length > 0 ? custom : defaultChoicesForStage(stage, config));
}

export function getQuestionFlow(config: SessionConfig): LessonQuestion[] {
  return sanitizeQuestionFlow(config).slice(0, MAX_QUESTION_COUNT);
}

export function getQuestionIndex(config: SessionConfig, stage: Stage) {
  return getQuestionFlow(config).findIndex((item) => item.stage === stage);
}

export function getNextQuestionStage(config: SessionConfig, stage: Stage): Stage {
  const flow = getQuestionFlow(config);
  const index = flow.findIndex((item) => item.stage === stage);
  if (index >= 0 && index < flow.length - 1) return flow[index + 1].stage;
  if (stage !== "draft" && stage !== "revise" && stage !== "final") return "draft";
  return stage;
}

export function defaultQuestionTemplate(stage: Stage, config: Pick<SessionConfig, "outputType">) {
  const outputType = config.outputType || "이미지 생성 프롬프트";
  if (stage === "orient") return `안녕하세요! 오늘은 "${TOPIC_TOKEN}" 주제로 이미지 프롬프트를 함께 만들어볼게요. 이 주제를 들었을 때 가장 먼저 떠오르는 장면이나 생각은 무엇인가요?`;
  if (stage === "explore") return `"${TOPIC_TOKEN}"와 연결해서 어떤 장소, 사람, 동물, 문제 상황, 변화가 보이면 좋을지 생각해볼까요?`;
  if (stage === "concrete") return "그 장면에서 누가, 어디에서, 무엇을 하고 있는지 조금 더 구체적으로 말해 주세요.";
  if (stage === "describe") return "그림의 분위기, 색감, 구도, 시점, 화풍을 골라볼까요? 잘 모르겠으면 아래 선택지 중 하나를 골라도 좋아요.";
  if (stage === "draft") return `지금까지의 답변을 바탕으로 ${outputType} 초안을 만들어볼게요.`;
  if (stage === "revise") return "초안을 보고 더 넣고 싶은 것, 빼고 싶은 것, 바꾸고 싶은 표현이 있으면 말해 주세요. 이대로 확정해도 괜찮아요.";
  if (stage === "final") return "이 프롬프트를 최종본으로 확정할까요?";
  return "학생 답변을 바탕으로 다음 생각을 물어봐 주세요.";
}

export function sanitizeQuestionFlow(config: SessionConfig): LessonQuestion[] {
  const raw = (config.questionFlow ?? []).slice(0, MAX_QUESTION_COUNT);
  const source = raw.length > 0 ? raw : buildDefaultQuestionFlow(config);
  const seen = new Set<string>();

  return source.map((item, index) => {
    const fallbackStage = STAGE_ORDER[index] ?? `question-${index + 1}`;
    let stage = String(item.stage || fallbackStage).trim() || fallbackStage;
    if (seen.has(stage)) stage = `${stage}-${index + 1}`;
    seen.add(stage);

    return {
      stage,
      label: String(item.label || STAGE_LABELS[stage] || `질문 ${index + 1}`).trim(),
      question: String(item.question || defaultQuestionTemplate(stage, config)).trim(),
      choices: normalizeChoices(item.choices && item.choices.length > 0 ? item.choices : defaultChoicesForStage(stage, config))
    };
  });
}

export function normalizeChoices(choices: QuestionChoice[] | undefined): QuestionChoice[] {
  return (choices ?? [])
    .map((choice) => ({
      label: String(choice.label ?? "").trim(),
      value: String(choice.value ?? choice.label ?? "").trim(),
      description: String(choice.description ?? "").trim() || undefined
    }))
    .filter((choice) => choice.label && choice.value)
    .slice(0, 6);
}

function defaultChoicesForStage(stage: Stage, config: Pick<SessionConfig, "topic" | "outputType">): QuestionChoice[] {
  const outputType = config.outputType || "이미지 생성 프롬프트";

  if (stage === "orient") {
    return [
      { label: "문제 상황", value: "해결해야 할 문제 상황을 보여주고 싶어요.", description: "오염, 위험, 불편함처럼 바뀌어야 할 장면" },
      { label: "희망 장면", value: "좋은 방향으로 바뀐 미래 모습을 보여주고 싶어요.", description: "해결된 뒤의 밝은 장면" },
      { label: "비교 장면", value: "현재 모습과 더 나은 모습을 함께 보여주고 싶어요.", description: "전과 후가 같이 보이는 장면" }
    ];
  }

  if (stage === "explore") {
    return [
      { label: "자연/환경", value: "바다, 숲, 강, 하늘 같은 자연환경이 중심이면 좋겠어요.", description: "환경 변화가 잘 보이는 배경" },
      { label: "사람들의 행동", value: "사람들이 문제를 발견하거나 해결하려고 움직이는 장면이면 좋겠어요.", description: "학생, 시민, 연구자 등 인물 중심" },
      { label: "동물/생명", value: "동물이나 생물이 영향을 받는 모습이 보이면 좋겠어요.", description: "돌고래, 물고기, 새, 식물 등" }
    ];
  }

  if (stage === "concrete") {
    return [
      { label: "오염된 장면", value: "쓰레기와 오염 때문에 불편하고 위험해 보이는 장면을 넣고 싶어요.", description: "문제의 심각함을 분명하게 보여줌" },
      { label: "해결 행동", value: "사람들이 쓰레기를 줍거나 환경을 회복시키는 행동을 넣고 싶어요.", description: "무엇을 해야 하는지 드러냄" },
      { label: "상징물", value: "깨끗한 바다, 새싹, 밝은 빛 같은 희망적인 상징을 넣고 싶어요.", description: "메시지를 한눈에 전달" }
    ];
  }

  if (stage === "describe") {
    return [
      { label: "수채화풍", value: "수채화풍으로 부드럽고 따뜻하게 표현하고 싶어요.", description: "물감이 번진 듯 감정이 부드러운 그림" },
      { label: "포스터풍", value: "포스터풍으로 색과 메시지가 선명하게 보이면 좋겠어요.", description: "캠페인 포스터처럼 주제가 한눈에 보이는 그림" },
      { label: "만화풍", value: "만화풍으로 학생들이 이해하기 쉽게 표현하고 싶어요.", description: "선이 또렷하고 친근한 느낌" },
      { label: "사진 같은 현실감", value: "사진처럼 현실감 있게 보여주고 싶어요.", description: "실제 장면처럼 생생하고 자세한 느낌" },
      { label: "픽셀아트", value: "픽셀아트처럼 단순하지만 귀엽고 눈에 띄게 표현하고 싶어요.", description: "게임 화면 같은 느낌" }
    ];
  }

  if (stage === "draft") return [{ label: "초안 만들어줘", value: `${outputType} 초안을 만들어줘.` }];
  if (stage === "revise") {
    return [
      { label: "더 구체적으로", value: "조금 더 구체적으로 바꿔줘." },
      { label: "더 밝게", value: "분위기를 더 밝고 희망적으로 바꿔줘." },
      { label: "이대로 확정", value: "이대로 확정할래." }
    ];
  }
  if (stage === "final") return [{ label: "확정", value: "최종본으로 확정할래." }];

  return [];
}
