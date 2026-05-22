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
  if (!args.purpose) {
    return { text: args.baseText, used: false, fallbackReason: "no_ai_purpose" };
  }

  const purpose = args.purpose;

  if (!args.config.aiEnabled) {
    return { text: args.baseText, used: false, fallbackReason: "ai_disabled" };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { text: args.baseText, used: false, fallbackReason: "missing_api_key" };
  }

  if (args.aiCallCount >= args.config.aiCallsPerStudentLimit) {
    return { text: args.baseText, used: false, fallbackReason: "limit_exceeded" };
  }

  try {
    const text = await callGeminiText([
      "너는 학생 답변 기반 프롬프트 수업 보조 AI다.",
      "학생 답변을 대신 작성하지 않는다.",
      `목적: ${purpose}`,
      `현재 단계: ${args.stage}`,
      `기준 문장:\n${args.baseText}`,
      "학생 답변 기록:",
      args.history.filter((message) => message.role === "user").map((message) => `- ${message.content}`).join("\n") || "- 아직 없음",
      "결과만 한국어로 출력해."
    ].join("\n\n"));
    return { text, used: true };
  } catch {
    return { text: args.baseText, used: false, fallbackReason: "provider_error" };
  }
}
