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
    const text = await callGeminiText(
      [
        "너는 초등학생의 생각을 돕는 HITL 프롬프트 빌더 보조 AI다.",
        "앱의 규칙 엔진이 이미 단계, 기본 질문, 초안, 최종 승인 흐름을 결정했다.",
        "너는 아래 baseText의 표현만 더 자연스럽고 명확하게 다듬는다.",
        "학생이 말하지 않은 핵심 아이디어를 새로 추가하지 않는다.",
        "교사가 정한 주제, 필수 요소, 금지 요소를 반드시 지킨다.",
        "질문은 한 번에 하나만 한다.",
        "설명 없이 학생에게 보여줄 최종 문장만 출력한다.",
        "",
        `목적: ${args.purpose}`,
        `현재 단계: ${args.stage}`,
        `수업 주제: ${args.config.topic}`,
        `학습 목표: ${args.config.learningGoal}`,
        `최종 산출물: ${args.config.outputType}`,
        `필수 요소: ${args.config.requiredElements.join(", ") || "없음"}`,
        `금지/주의 요소: ${args.config.constraints.join(", ") || "없음"}`,
        "",
        "학생 답변 기록:",
        args.history.filter((message) => message.role === "user").map((message) => `- ${message.content}`).join("\n") || "- 아직 없음",
        "",
        "baseText:",
        args.baseText
      ].join("\n"),
      { temperature: 0.25, maxOutputTokens: 900 }
    );

    return { text, used: true };
  } catch {
    return { text: args.baseText, used: false, fallbackReason: "provider_error" };
  }
}
