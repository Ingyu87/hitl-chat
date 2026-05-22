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
  if (!process.env.GEMINI_API_KEY) return { text: args.baseText, used: false, fallbackReason: "missing_api_key" };
  if (args.aiCallCount >= args.config.aiCallsPerStudentLimit) {
    return { text: args.baseText, used: false, fallbackReason: "limit_exceeded" };
  }

  try {
    const text = await callGeminiText(buildAssistPrompt(args), {
      temperature: args.purpose === "question_polish" ? 0.55 : 0.35,
      maxOutputTokens: args.purpose === "question_polish" ? 520 : 900
    });

    return { text: text.trim(), used: true };
  } catch {
    return { text: args.baseText, used: false, fallbackReason: "provider_error" };
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
    .slice(-8)
    .map((message) => `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`)
    .join("\n");
  const latestStudent = [...args.history].reverse().find((message) => message.role === "user")?.content ?? "";

  if (args.purpose === "question_polish") {
    return [
      "너는 학생과 1:1로 대화하는 한국어 챗봇이다.",
      "교사가 승인한 다음 질문을 바탕으로, 학생의 직전 답변에 짧게 반응한 뒤 자연스럽게 다음 질문을 이어서 물어본다.",
      "",
      "중요 규칙:",
      "- 학생의 아이디어를 대신 만들어주지 않는다.",
      "- 학생이 장난스럽거나 모호하게 답하면 부드럽게 다시 구체화를 요청한다.",
      "- 수업 주제에서 벗어나지 않는다.",
      "- 말투는 짧고 친근하게 한다.",
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
    "너는 학생 답변을 바탕으로 이미지 생성 프롬프트를 정리하는 한국어 보조 AI다.",
    "학생이 말하지 않은 핵심 아이디어를 새로 만들어내지 말고, 지금까지의 답변을 명확한 프롬프트 문장으로 정리한다.",
    "교사의 필수 포함 요소와 주의 요소를 반영하되, 부족한 내용은 과도하게 상상해서 채우지 않는다.",
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
    "기본 초안:",
    args.baseText,
    "",
    "최종 출력은 프롬프트 본문만 작성한다."
  ].join("\n");
}
