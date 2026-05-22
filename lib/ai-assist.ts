import { callGeminiText } from "@/lib/gemini";
import type { AiAssistResult, AiPurpose, ChatMessage, SessionConfig, Stage } from "@/lib/types";

export async function maybeAssistWithAi(args: {
  config: SessionConfig;
  stage: Stage;
  purpose?: AiPurpose;
  baseText: string;
  history: ChatMessage[];
  aiCallCount: number;
}): Promise<AiAssistResult> {
  if (!args.purpose) return { text: args.baseText, used: false, fallbackReason: "no_ai_purpose" };
  if (!args.config.aiEnabled) return { text: args.baseText, used: false, fallbackReason: "ai_disabled" };
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return { text: args.baseText, used: false, fallbackReason: "missing_api_key" };
  }

  const remainingCalls = args.config.aiCallsPerStudentLimit - args.aiCallCount;
  if (remainingCalls <= 0) return { text: args.baseText, used: false, fallbackReason: "limit_exceeded" };

  // 프롬프트 초안/수정이 핵심 기능이므로, 질문 말투 보조가 AI 예산을 먼저 다 써버리지 않게 한다.
  if (args.purpose === "question_polish" && remainingCalls <= 2) {
    return { text: args.baseText, used: false, fallbackReason: "reserved_for_prompt_generation" };
  }

  try {
    const text = await callGeminiText(buildAssistPrompt(args), {
      temperature: args.purpose === "question_polish" ? 0.55 : 0.35,
      maxOutputTokens: args.purpose === "question_polish" ? 520 : 1200
    });

    return { text: text.trim(), used: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    return { text: args.baseText, used: false, fallbackReason: message };
  }
}

function buildAssistPrompt(args: {
  config: SessionConfig;
  stage: Stage;
  purpose?: AiPurpose;
  baseText: string;
  history: ChatMessage[];
}) {
  const recent = args.history
    .slice(-10)
    .map((message) => `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`)
    .join("\n");
  const latestStudent = [...args.history].reverse().find((message) => message.role === "user")?.content ?? "";

  if (args.purpose === "question_polish") {
    return [
      "너는 학생과 1:1로 대화하는 한국어 챗봇이다.",
      "교사가 승인한 다음 질문을 바탕으로, 학생의 직전 답변에 짧게 반응한 뒤 자연스럽게 다음 질문을 이어서 물어본다.",
      "",
      "규칙:",
      "- 학생의 아이디어를 대신 만들어주지 않는다.",
      "- 학생이 장난스럽거나 모호하게 답하면 부드럽게 구체화를 요청한다.",
      "- 수업 주제에서 벗어나지 않는다.",
      "- 답변은 2~4문장 이내로 짧고 친근하게 쓴다.",
      "- 최종 출력은 학생에게 보낼 챗봇 메시지 1개만 작성한다.",
      "",
      `수업 주제: ${args.config.topic}`,
      `학습 목표: ${args.config.learningGoal}`,
      `최종 산출물: ${args.config.outputType}`,
      `필수 포함 요소: ${args.config.requiredElements.join(", ") || "없음"}`,
      `금지/주의 요소: ${args.config.constraints.join(", ") || "없음"}`,
      `현재 단계: ${args.stage}`,
      "",
      "최근 대화:",
      recent || "없음",
      "",
      `학생의 직전 답변: ${latestStudent}`,
      "",
      "교사가 승인한 다음 질문:",
      args.baseText
    ].join("\n");
  }

  return [
    "너는 학생 대화를 바탕으로 이미지 생성 프롬프트를 작성하는 한국어 보조 AI다.",
    "아래 대화에서 학생이 실제로 말한 아이디어만 추출해, 이미지 생성 AI에 바로 넣을 수 있는 완성도 높은 프롬프트로 재작성한다.",
      "",
    "매우 중요한 규칙:",
    "- 교사 설정과 학생 답변을 목록처럼 그대로 붙여넣지 않는다.",
    "- 학생이 말하지 않은 핵심 아이디어를 새로 만들지 않는다.",
    "- 무성의한 답변, 장난 답변, 주제와 무관한 답변은 프롬프트 내용에 넣지 않는다.",
    "- 장소, 주체, 행동, 분위기, 구도, 스타일, 색감이 대화에 있으면 자연스러운 한 문단으로 통합한다.",
    "- 내용이 부족하면 부족하다고 쓰지 말고, 확인된 내용 안에서 간결한 프롬프트를 만든다.",
    "- 최종 출력은 이미지 생성 프롬프트 본문만 작성한다.",
    "",
    `수업 주제: ${args.config.topic}`,
    `학습 목표: ${args.config.learningGoal}`,
    `최종 산출물: ${args.config.outputType}`,
    `필수 포함 요소: ${args.config.requiredElements.join(", ") || "없음"}`,
    `금지/주의 요소: ${args.config.constraints.join(", ") || "없음"}`,
    "",
    "최근 대화:",
    recent || "없음",
    "",
    "규칙 기반 초안:",
    args.baseText
  ].join("\n");
}
