import { callGemini } from "@/lib/gemini";
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
    const text = await callGemini({ ...args, purpose });
    return { text, used: true };
  } catch {
    return { text: args.baseText, used: false, fallbackReason: "provider_error" };
  }
}
