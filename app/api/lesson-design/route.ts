import { callGeminiText, parseJsonObject } from "@/lib/gemini";
import type { SessionConfig, Stage } from "@/lib/types";

type LessonDesignBody = {
  config: SessionConfig;
  mode: "generate" | "refine";
};

type LessonDesignResult = {
  questionFlow: { stage: Stage; label: string; question: string }[];
};

const STAGE_ORDER: Stage[] = ["orient", "explore", "concrete", "describe", "revise", "final"];

export async function POST(request: Request) {
  const body = (await request.json()) as LessonDesignBody;

  try {
    const prompt = [
      "너는 초등 수업 설계 보조 AI다.",
      "프롬프트 작성 수업에서 학생이 자기 생각을 직접 말하도록 질문 단계를 설계한다.",
      "학생의 답을 대신 제시하거나 정답을 유도하지 않는다.",
      "교사가 나중에 추가/삭제/수정할 수 있도록 명확한 질문 문장으로 만든다.",
      "반드시 JSON 객체만 출력한다.",
      "",
      `작업: ${body.mode === "generate" ? "질문 단계 새로 만들기" : "현재 질문 단계 다듬기"}`,
      `수업 제목: ${body.config.title}`,
      `수업 주제: ${body.config.topic}`,
      `학습 목표: ${body.config.learningGoal}`,
      `최종 산출물: ${body.config.outputType}`,
      `필수 포함 요소: ${body.config.requiredElements.join(", ") || "없음"}`,
      `주의 요소: ${body.config.constraints.join(", ") || "없음"}`,
      "",
      "현재 질문 단계:",
      body.config.questionFlow.map((item, index) => `${index + 1}. ${item.label}: ${item.question}`).join("\n"),
      "",
      "JSON 형식:",
      '{"questionFlow":[{"stage":"orient","label":"주제 이해","question":"질문"},{"stage":"explore","label":"아이디어 탐색","question":"질문"},{"stage":"concrete","label":"구체화","question":"질문"},{"stage":"describe","label":"조건 묘사","question":"질문"},{"stage":"revise","label":"수정","question":"질문"},{"stage":"final","label":"최종 승인","question":"질문"}]}'
    ].join("\n");

    const text = await callGeminiText(prompt, { temperature: 0.45, maxOutputTokens: 1300 });
    const parsed = parseJsonObject<LessonDesignResult>(text, { questionFlow: body.config.questionFlow });
    const questionFlow = normalizeQuestionFlow(parsed.questionFlow, body.config);

    return Response.json({ questionFlow, aiUsed: true });
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
  const currentByStage = new Map(config.questionFlow.map((item) => [item.stage, item]));
  const incomingByStage = new Map((questionFlow || []).map((item) => [item.stage, item]));

  return STAGE_ORDER.map((stage) => {
    const item = incomingByStage.get(stage) || currentByStage.get(stage);
    return {
      stage,
      label: item?.label || stage,
      question: item?.question || currentByStage.get(stage)?.question || "학생이 자기 생각을 이어 말할 수 있도록 질문해줘."
    };
  });
}
