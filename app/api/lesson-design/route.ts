import { callGeminiText, parseJsonObject } from "@/lib/gemini";
import type { SessionConfig, Stage } from "@/lib/types";

type LessonDesignBody = {
  config: SessionConfig;
  mode: "generate" | "refine";
};

type LessonDesignResult = {
  questionFlow: { stage: Stage; label: string; question: string }[];
  requiredElements?: string[];
  constraints?: string[];
};

const STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe", "draft", "revise", "final"];

export async function POST(request: Request) {
  const body = (await request.json()) as LessonDesignBody;

  try {
    const prompt = [
      "너는 초등 수업 설계 보조 AI다.",
      "교사가 입력한 수업 주제를 바탕으로 이미지 생성 프롬프트 수업의 질문 단계, 필수 포함 요소, 금지/주의 요소를 설계한다.",
      "학습 목표는 고정이다: 학생이 주제에 맞는 아이디어를 구체화하고, 생성형 AI에 넣을 수 있는 명확한 프롬프트를 완성한다.",
      "학생의 답을 대신 제시하거나 정답을 유도하지 않는다.",
      "질문은 학생이 자기 생각을 직접 말하도록 한 번에 하나씩 묻는다.",
      "교사가 나중에 수정할 수 있도록 명확하고 짧은 질문 문장으로 만든다.",
      "절대 '질문', '학생이 자기 생각을 이어 말할 수 있도록 질문해줘' 같은 자리표시자 문장을 출력하지 않는다.",
      "각 질문에는 수업 주제의 핵심어가 자연스럽게 반영되어야 한다.",
      "stage 값은 orient, explore, concrete, describe, draft, revise, final 중 하나만 사용한다.",
      "label 값은 각각 주제 이해, 아이디어 탐색, 구체화, 조건 묘사, 초안 생성, 수정, 최종 승인 중 하나만 사용한다.",
      "반드시 JSON 객체만 출력한다.",
      "",
      `작업: ${body.mode === "generate" ? "수업 설계 예시 새로 만들기" : "현재 수업 설계 다듬기"}`,
      `수업 주제: ${body.config.topic}`,
      `학습 목표: ${body.config.learningGoal}`,
      `최종 산출물: ${body.config.outputType}`,
      `필수 포함 요소: ${body.config.requiredElements.join(", ") || "없음"}`,
      `주의 요소: ${body.config.constraints.join(", ") || "없음"}`,
      "",
      "현재 질문 단계:",
      body.config.questionFlow.map((item, index) => `${index + 1}. ${item.label}: ${item.question}`).join("\n"),
      "",
      "필수 포함 요소와 금지/주의 요소는 수업 주제에 맞게 3~5개씩 제안한다.",
      "질문 단계는 주제 이해, 아이디어 탐색, 구체화, 조건 묘사, 초안 생성, 수정, 최종 승인 순서로 만든다.",
      "",
      "JSON 형식:",
      '{"requiredElements":["주제와 관련된 장소 또는 상황","표현할 주요 대상","AI 활용 방법 또는 문제 해결 방법","장면의 분위기"],"constraints":["수업 주제와 무관한 내용 제외","혐오 또는 위험 표현 제외","학생이 말하지 않은 핵심 아이디어 임의 추가 금지"],"questionFlow":[{"stage":"orient","label":"주제 이해","question":"오늘 주제에서 가장 중요하다고 생각하는 장면이나 문제를 한 문장으로 말해볼까요?"},{"stage":"explore","label":"아이디어 탐색","question":"그 장면에서 어떤 사람이 무엇을 하고 있으면 좋을까요?"},{"stage":"concrete","label":"구체화","question":"장소, 대상, 해결 방법이 잘 보이도록 더 구체적으로 설명해볼까요?"},{"stage":"describe","label":"조건 묘사","question":"색감, 분위기, 시점, 반드시 포함할 요소를 자세히 말해볼까요?"},{"stage":"draft","label":"초안 생성","question":"좋아요. 지금까지 답한 내용을 바탕으로 이미지 생성 프롬프트 초안을 만들어볼게요."},{"stage":"revise","label":"수정","question":"초안을 보고 더 넣거나 빼고 싶은 조건이 있나요?"},{"stage":"final","label":"최종 승인","question":"최종 프롬프트가 저장되었습니다."}]}'
    ].join("\n");

    const text = await callGeminiText(prompt, { temperature: 0.45, maxOutputTokens: 1300 });
    const parsed = parseJsonObject<LessonDesignResult>(text, { questionFlow: body.config.questionFlow });
    const questionFlow = normalizeQuestionFlow(parsed.questionFlow, body.config);

    return Response.json({
      questionFlow,
      requiredElements: normalizeList(parsed.requiredElements, body.config.requiredElements),
      constraints: normalizeList(parsed.constraints, body.config.constraints),
      aiUsed: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini lesson design failed";
    return Response.json(
      {
        error: message,
        aiUsed: false,
        questionFlow: body.config.questionFlow
      },
      { status: 500 }
    );
  }
}

function normalizeQuestionFlow(questionFlow: LessonDesignResult["questionFlow"], config: SessionConfig) {
  const incomingByStage = new Map((questionFlow || []).map((item) => [item.stage, item]));

  return STAGE_ORDER.map((stage) => {
    const stageMeta = stageMetaFor(stage);
    const item = incomingByStage.get(stage);
    const question = cleanQuestion(item?.question) || fallbackQuestion(stage, config);
    return {
      stage,
      label: stageMeta.label,
      question
    };
  });
}

function normalizeList(items: string[] | undefined, fallback: string[]) {
  const normalized = (items ?? []).map((item) => String(item).trim()).filter((item) => item && !/필수 요소|주의 요소/.test(item));
  return normalized.length > 0 ? normalized.slice(0, 5) : fallback;
}

function cleanQuestion(question: string | undefined) {
  const value = String(question ?? "").trim();
  if (!value) return "";
  if (/^질문$|자리표시자|학생이 자기 생각을 이어 말할 수 있도록 질문해줘/.test(value)) return "";
  return value;
}

function stageMetaFor(stage: Stage) {
  return {
    orient: { label: "주제 이해" },
    explore: { label: "아이디어 탐색" },
    concrete: { label: "구체화" },
    describe: { label: "조건 묘사" },
    draft: { label: "초안 생성" },
    revise: { label: "수정" },
    final: { label: "최종 승인" }
  }[stage];
}

function fallbackQuestion(stage: Stage, config: SessionConfig) {
  const topic = config.topic || "오늘 수업 주제";
  return {
    orient: `오늘 주제는 "${topic}"입니다. 이 주제에서 가장 중요하다고 생각하는 점을 한 문장으로 말해볼까요?`,
    explore: `"${topic}"을 이미지로 표현한다면 어떤 장면이나 상황을 보여주고 싶나요?`,
    concrete: `그 장면에 들어갈 장소, 주요 대상, 문제 해결 방법을 구체적으로 설명해볼까요?`,
    describe: `색감, 분위기, 시점, 반드시 보여야 하는 요소를 자세히 말해볼까요?`,
    draft: "좋아요. 지금까지 답한 내용을 바탕으로 이미지 생성 프롬프트 초안을 만들어볼게요.",
    revise: "초안을 보고 더 넣거나 빼고 싶은 조건, 바꾸고 싶은 표현이 있나요?",
    final: "최종 프롬프트가 저장되었습니다."
  }[stage];
}
