import type { LessonQuestion, QuestionChoice, SessionConfig, Stage } from "@/lib/types";

export const MAX_QUESTION_COUNT = 50;

export const STUDENT_STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe"];
export const STAGE_ORDER: Stage[] = [...STUDENT_STAGE_ORDER, "draft", "revise", "final"];
const SYSTEM_STAGES = new Set(["draft", "revise", "final"]);

export const STAGE_LABELS: Record<string, string> = {
  orient: "주제 연결",
  explore: "아이디어 확장",
  concrete: "구체화",
  describe: "시각 스타일",
  draft: "초안 만들기",
  revise: "수정 의견",
  final: "최종 확인"
};

const TOPIC_TOKEN = "{{topic}}";

type TopicProfile = "environment" | "ocean" | "schoolSafety" | "generic";

export function injectTopic(text: string, config: Pick<SessionConfig, "topic">) {
  return text.replace(/\{\{topic\}\}/g, config.topic.trim() || "이번 주제");
}

export function normalizeQuestionText(text: string, config: Pick<SessionConfig, "topic">) {
  return injectTopic(text, config).replace(/\s+/g, " ").trim();
}

export function buildDefaultQuestionFlow(config: Pick<SessionConfig, "topic" | "outputType">): LessonQuestion[] {
  return STUDENT_STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    question: defaultQuestionTemplate(stage, config),
    choices: defaultChoicesForStage(stage, config)
  }));
}

export function getQuestionForStage(config: SessionConfig, stage: Stage) {
  if (SYSTEM_STAGES.has(stage)) return normalizeQuestionText(defaultQuestionTemplate(stage, config), config);

  const flow = sanitizeQuestionFlow(config);
  const custom = flow.find((item) => item.stage === stage)?.question;
  return normalizeQuestionText(custom || defaultQuestionTemplate(stage, config), config);
}

export function getChoicesForStage(config: SessionConfig, stage: Stage): QuestionChoice[] {
  if (SYSTEM_STAGES.has(stage)) return defaultChoicesForStage(stage, config);

  const flow = sanitizeQuestionFlow(config);
  const custom = flow.find((item) => item.stage === stage)?.choices;
  return normalizeChoices(custom && custom.length > 0 ? custom : defaultChoicesForStage(stage, config));
}

export function getQuestionFlow(config: SessionConfig): LessonQuestion[] {
  return sanitizeQuestionFlow(config).slice(0, MAX_QUESTION_COUNT);
}

export function getInitialQuestionStage(config: SessionConfig): Stage {
  return getStudentQuestionFlow(config)[0]?.stage || "orient";
}

export function getNextQuestionStage(config: SessionConfig, stage: Stage): Stage {
  const flow = getStudentQuestionFlow(config);
  const index = flow.findIndex((item) => item.stage === stage);
  if (index >= 0 && index < flow.length - 1) return flow[index + 1].stage;
  if (stage !== "draft" && stage !== "revise" && stage !== "final") return "draft";
  return stage;
}

export function defaultQuestionTemplate(stage: Stage, config: Pick<SessionConfig, "outputType">) {
  const outputType = config.outputType || "이미지 생성 프롬프트";
  if (stage === "orient") return `안녕하세요. 오늘은 "${TOPIC_TOKEN}" 주제로 이미지 프롬프트를 함께 만들 거예요. 이 주제를 들었을 때 가장 먼저 떠오르는 장면이나 생각은 무엇인가요?`;
  if (stage === "explore") return `"${TOPIC_TOKEN}"와 연결해서 어떤 장소, 사람, 동물, 문제 상황, 변화가 보이면 좋을지 생각해 볼까요?`;
  if (stage === "concrete") return "그 장면에서 누가, 어디에서, 무엇을 하고 있는지 조금 더 구체적으로 말해 주세요.";
  if (stage === "describe") return "그림의 분위기, 색감, 구도, 시점, 스타일을 골라볼까요? 잘 모르겠으면 아래 선택지 중 하나를 골라도 좋아요.";
  if (stage === "draft") return `지금까지의 답변을 바탕으로 ${outputType} 초안을 만들어 볼게요.`;
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

export function getStudentQuestionFlow(config: SessionConfig): LessonQuestion[] {
  const studentFlow = getQuestionFlow(config).filter((item) => !isSystemCheckpoint(item));
  return studentFlow.length > 0 ? studentFlow : buildDefaultQuestionFlow(config).filter((item) => !SYSTEM_STAGES.has(item.stage));
}

function isSystemCheckpoint(item: LessonQuestion) {
  if (SYSTEM_STAGES.has(item.stage)) return true;
  const text = `${item.label} ${item.question}`.replace(/\s/g, "");
  return /프롬프트.*(만들|작성|생성|초안)|최종본|최종확인|확정할까요/.test(text);
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
  const topic = config.topic.trim() || "이번 주제";
  const outputType = config.outputType || "이미지 생성 프롬프트";
  const profile = getTopicProfile(topic);

  if (stage === "orient") return orientChoices(topic, profile);
  if (stage === "explore") return exploreChoices(topic, profile);
  if (stage === "concrete") return concreteChoices(topic, profile);
  if (stage === "describe") return styleChoices();
  if (stage === "draft") return [{ label: "초안 만들기", value: `${outputType} 초안을 만들어줘.` }];
  if (stage === "revise") {
    return [
      { label: "더 구체적으로", value: "장면이 더 선명하게 보이도록 구체적으로 바꿔줘." },
      { label: "더 밝게", value: "분위기를 더 밝고 희망적으로 바꿔줘." },
      { label: "이대로 확정", value: "이대로 확정할래." }
    ];
  }
  if (stage === "final") return [{ label: "확정", value: "최종본으로 확정할래." }];

  return [];
}

function getTopicProfile(topic: string): TopicProfile {
  const normalized = topic.replace(/\s/g, "").toLowerCase();
  if (/바다|해양|물고기|생태|플라스틱|산호|갯벌/.test(normalized)) return "ocean";
  if (/학교|교실|운동장|안전|폭력|따돌림|재난|대피/.test(normalized)) return "schoolSafety";
  if (/환경|지구|미래|오염|쓰레기|기후|탄소|자연|생태계|200년/.test(normalized)) return "environment";
  return "generic";
}

function orientChoices(topic: string, profile: TopicProfile): QuestionChoice[] {
  if (profile === "ocean") {
    return [
      { label: "오염된 바다", value: `${topic}에서 플라스틱과 쓰레기로 힘들어진 바다 장면을 보여주고 싶어.`, description: "문제 상황이 바로 보이는 장면" },
      { label: "회복된 바다", value: `${topic}에서 깨끗하게 회복된 바다와 생물이 살아나는 장면을 보여주고 싶어.`, description: "해결 뒤의 희망적인 장면" },
      { label: "비교 장면", value: `${topic}의 나쁜 모습과 좋아진 모습을 한 화면에서 비교하고 싶어.`, description: "전과 후가 함께 보이는 장면" }
    ];
  }

  if (profile === "schoolSafety") {
    return [
      { label: "위험 발견", value: `${topic}에서 학생이 위험한 상황을 발견하는 장면을 보여주고 싶어.`, description: "문제 상황을 알아차리는 장면" },
      { label: "도움 요청", value: `${topic}에서 친구나 선생님에게 도움을 요청하는 장면을 보여주고 싶어.`, description: "안전하게 해결을 시작하는 장면" },
      { label: "안전한 변화", value: `${topic} 덕분에 모두가 더 안전해진 장면을 보여주고 싶어.`, description: "해결 뒤의 안정적인 장면" }
    ];
  }

  if (profile === "environment") {
    return [
      { label: "오염·위험", value: `${topic}에서 오염, 쓰레기, 위험처럼 바뀌어야 할 문제 상황을 보여주고 싶어.`, description: "불편함과 위험이 보이는 장면" },
      { label: "회복·해결", value: `${topic}에서 사람들이 문제를 해결해 환경이 회복되는 장면을 보여주고 싶어.`, description: "해결 뒤의 밝은 장면" },
      { label: "현재·미래", value: `${topic}의 현재 모습과 변화된 미래 모습을 함께 보여주고 싶어.`, description: "바뀌기 전과 후가 보이는 장면" }
    ];
  }

  return [
    { label: "갈등 포착", value: `${topic}에서 해결해야 할 문제나 갈등이 보이는 장면을 보여주고 싶어.`, description: "주제의 핵심 문제가 드러나는 장면" },
    { label: "해결 변화", value: `${topic}에서 문제가 해결되어 더 좋아진 장면을 보여주고 싶어.`, description: "주제의 긍정적인 변화가 보이는 장면" },
    { label: "비교 장면", value: `${topic}의 전과 후를 비교해서 보여주고 싶어.`, description: "변화가 한눈에 보이는 장면" }
  ];
}

function exploreChoices(topic: string, profile: TopicProfile): QuestionChoice[] {
  if (profile === "ocean") {
    return [
      { label: "바다 생물", value: `${topic}에서 물고기, 거북이, 산호 같은 바다 생물이 중심이면 좋겠어.`, description: "생물의 표정과 움직임 중심" },
      { label: "사람의 행동", value: `${topic}에서 사람들이 쓰레기를 치우거나 바다를 지키는 행동이 보이면 좋겠어.`, description: "해결 행동 중심" },
      { label: "바닷속 배경", value: `${topic}의 바닷속 풍경과 오염된 물, 빛의 차이가 보이면 좋겠어.`, description: "장소와 분위기 중심" }
    ];
  }

  if (profile === "schoolSafety") {
    return [
      { label: "학생 행동", value: `${topic}에서 학생들이 안전하게 행동하는 모습이 중심이면 좋겠어.`, description: "학생의 선택과 행동 중심" },
      { label: "도움 주는 어른", value: `${topic}에서 선생님이나 주변 사람이 도와주는 모습이 보이면 좋겠어.`, description: "도움과 협력 중심" },
      { label: "안전 표시", value: `${topic}을 알려주는 표지판, 안내선, 보호 장비가 보이면 좋겠어.`, description: "안전 요소 중심" }
    ];
  }

  return [
    { label: "장소", value: `${topic}가 잘 드러나는 장소나 배경을 중심으로 보여주고 싶어.`, description: "어디에서 벌어지는지 분명한 장면" },
    { label: "사람의 행동", value: `${topic}와 관련된 사람이 문제를 발견하거나 해결하는 모습이면 좋겠어.`, description: "행동과 변화 중심" },
    { label: "상징물", value: `${topic}를 한눈에 알 수 있는 상징물이나 대비되는 물건을 넣고 싶어.`, description: "메시지를 빠르게 전달하는 요소" }
  ];
}

function concreteChoices(topic: string, profile: TopicProfile): QuestionChoice[] {
  if (profile === "ocean") {
    return [
      { label: "플라스틱 더미", value: `${topic} 장면에 떠다니는 플라스틱과 쓰레기 더미를 넣고 싶어.`, description: "문제의 심각함을 보여줌" },
      { label: "구조되는 생물", value: `${topic} 장면에 사람이 바다 생물을 구조하거나 보호하는 모습을 넣고 싶어.`, description: "해결 행동을 보여줌" },
      { label: "맑아지는 물", value: `${topic} 장면에서 물이 점점 깨끗해지는 변화를 보여주고 싶어.`, description: "회복의 느낌을 보여줌" }
    ];
  }

  if (profile === "schoolSafety") {
    return [
      { label: "위험 신호", value: `${topic} 장면에 학생이 알아차릴 수 있는 위험 신호를 넣고 싶어.`, description: "문제 발견을 구체화" },
      { label: "도움 요청", value: `${topic} 장면에 손을 들거나 선생님에게 알리는 행동을 넣고 싶어.`, description: "안전한 해결 방법" },
      { label: "안전한 동선", value: `${topic} 장면에 학생들이 안전한 길로 이동하는 모습을 넣고 싶어.`, description: "해결 뒤의 질서" }
    ];
  }

  return [
    { label: "문제 요소", value: `${topic}에서 꼭 바뀌어야 할 문제 요소를 화면 앞쪽에 넣고 싶어.`, description: "주제의 문제를 선명하게 보여줌" },
    { label: "해결 행동", value: `${topic}와 관련해 사람이 직접 해결하려고 움직이는 모습을 넣고 싶어.`, description: "무엇을 해야 하는지 보여줌" },
    { label: "희망 상징", value: `${topic}의 좋은 변화를 상징하는 밝은 빛이나 색을 넣고 싶어.`, description: "메시지를 눈에 띄게 전달" }
  ];
}

function styleChoices(): QuestionChoice[] {
  return [
    { label: "수채화풍", value: "수채화풍으로 부드럽고 따뜻하게 표현하고 싶어.", description: "물감이 번진 듯 감정이 부드러운 그림" },
    { label: "포스터풍", value: "포스터풍으로 색과 메시지가 선명하게 보이면 좋겠어.", description: "캠페인 포스터처럼 주제가 한눈에 보이는 그림" },
    { label: "만화풍", value: "만화풍으로 학생들이 이해하기 쉽게 표현하고 싶어.", description: "선이 또렷하고 친근한 그림" },
    { label: "사진처럼", value: "사진처럼 현실감 있게 보여주고 싶어.", description: "실제 장면처럼 생생하고 자세한 그림" },
    { label: "픽셀아트", value: "픽셀아트처럼 단순하지만 귀엽고 눈에 띄게 표현하고 싶어.", description: "게임 화면 같은 느낌" }
  ];
}
