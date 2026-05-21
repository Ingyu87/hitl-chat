import { maybeAssistWithAi } from "@/lib/ai-assist";
import { getNextFlow } from "@/lib/flow";
import { checkSafety } from "@/lib/safety";
import type { ChatMessage, SessionConfig, Stage } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    config: SessionConfig;
    history: ChatMessage[];
    message: string;
    currentStage: Stage;
    latestPrompt?: string;
    loopCount: number;
    aiCallCount: number;
  };

  const safety = checkSafety(body.message);
  if (!safety.isSafe) {
    return Response.json({
      blocked: true,
      alertType: safety.alertType,
      message: safety.message,
      stage: body.currentStage,
      aiUsed: false
    });
  }

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: body.message,
    stage: body.currentStage,
    createdAt: new Date().toISOString()
  };

  const historyWithInput = [...body.history, userMessage];
  const flow = getNextFlow({
    config: body.config,
    history: historyWithInput,
    studentInput: body.message,
    currentStage: body.currentStage,
    latestPrompt: body.latestPrompt,
    loopCount: body.loopCount
  });

  const assist = await maybeAssistWithAi({
    config: body.config,
    stage: flow.nextStage,
    purpose: flow.aiPurpose,
    baseText: flow.draftPrompt ?? flow.assistantMessage,
    history: historyWithInput,
    aiCallCount: body.aiCallCount
  });

  const assistantText = flow.draftPrompt && assist.used
    ? `지금까지의 답을 모아 프롬프트 초안을 만들었어.\n\n${assist.text}\n\n수정하고 싶은 점이 있으면 말해줘. 괜찮으면 "이걸로 확정할래요"라고 답하면 돼.`
    : assist.text;

  return Response.json({
    blocked: false,
    userMessage,
    assistantMessage: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantText,
      stage: flow.nextStage,
      createdAt: new Date().toISOString()
    },
    stage: flow.nextStage,
    draftPrompt: flow.draftPrompt ? assist.text : undefined,
    promptSource: flow.draftPrompt ? (assist.used ? "ai_assisted" : flow.promptSource) : undefined,
    shouldCreatePrompt: flow.shouldCreatePrompt,
    isFinal: flow.isFinal,
    aiLog: flow.aiPurpose
      ? {
          id: crypto.randomUUID(),
          provider: "gemini",
          purpose: flow.aiPurpose,
          stage: flow.nextStage,
          used: assist.used,
          fallbackReason: assist.fallbackReason,
          createdAt: new Date().toISOString()
        }
      : undefined,
    aiUsed: assist.used
  });
}
