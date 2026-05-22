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

  if (args.purpose === "question_polish" && remainingCalls <= 2) {
    return { text: args.baseText, used: false, fallbackReason: "reserved_for_prompt_generation" };
  }

  try {
    const text = await callGeminiText(buildAssistPrompt(args), {
      temperature: args.purpose === "question_polish" ? 0.6 : 0.35,
      maxOutputTokens: args.purpose === "question_polish" ? 900 : 1400
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
    .slice(-12)
    .map((message) => `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`)
    .join("\n");
  const latestStudent = [...args.history].reverse().find((message) => message.role === "user")?.content ?? "";

  if (args.purpose === "question_polish") {
    return [
      "너는 학생과 1:1로 대화하며 이미지 생성 프롬프트를 완성하도록 돕는 한국어 챗봇이다.",
      "교사가 승인한 대화 흐름은 학생에게 그대로 복붙할 문장이 아니라, 네가 따라야 할 대화 목적/방향이다.",
      "학생의 직전 답변을 읽고 짧게 반응한 뒤, 승인된 흐름의 의도에 맞게 자연스럽게 다음 말을 한다.",
      "",
      "중요 규칙:",
      "- 승인된 흐름 문장을 그대로 복사하지 않는다.",
      "- 학생이 말하지 않은 핵심 아이디어를 대신 만들어주지 않는다.",
      "- 답변이 장난/무성의/주제 이탈이면 구체적으로 다시 생각하게 한다.",
      "- 이미지 프롬프트에 필요한 요소를 빠뜨리지 않게 대화한다: 장소, 주요 대상, 행동, 문제/해결, 분위기, 색감, 구도, 시점, 화풍/스타일.",
      "- 특히 describe 단계에서는 화풍/스타일, 색감, 카메라 시점, 구도를 반드시 물어본다.",
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
      "교사가 승인한 이번 단계의 대화 흐름/목적:",
      args.baseText
    ].join("\n");
  }

  return [
    "너는 학생 대화를 바탕으로 이미지 생성 AI용 프롬프트를 작성하는 한국어 보조 AI다.",
    "아래 대화에서 학생이 실제로 말한 의미 있는 아이디어만 추출해, 이미지 생성 AI에 바로 넣을 수 있는 완성도 높은 프롬프트로 재작성한다.",
    "",
    "중요 규칙:",
    "- 교사 설정과 학생 답변을 목록처럼 그대로 붙여넣지 않는다.",
    "- 학생이 말하지 않은 핵심 아이디어를 새로 만들지 않는다.",
    "- 무성의한 답변, 장난 답변, 주제와 무관한 답변은 프롬프트 내용에 넣지 않는다.",
    "- 프롬프트는 한 문단 또는 자연스러운 문장 묶음으로 작성한다.",
    "- 장소, 주요 대상, 행동, 문제/해결, 분위기, 색감, 구도, 시점, 화풍/스타일을 가능한 한 통합한다.",
    "- 학생이 화풍/스타일을 말하지 않았다면 '학생이 선택한 화풍이 아직 없음'이라고 쓰지 말고, 대화에서 확인된 시각 요소만 사용한다.",
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
