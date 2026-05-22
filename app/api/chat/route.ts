import { maybeAssistWithAi } from "@/lib/ai-assist";
import { getNextFlow } from "@/lib/flow";
import { getQuestionForStage } from "@/lib/question-flow";
import { checkSafety } from "@/lib/safety";
import type { AiAssistLog, ChatMessage, PromptSource, SessionConfig, Stage } from "@/lib/types";

type ChatBody = {
  config: SessionConfig;
  history: ChatMessage[];
  message: string;
  currentStage: Stage;
  latestPrompt?: string;
  loopCount: number;
  aiCallCount?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const now = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: body.message,
    stage: body.currentStage,
    createdAt: now
  };

  const staticSafety = checkSafety(body.message);
  if (!staticSafety.isSafe) {
    return Response.json({
      blocked: true,
      alertType: staticSafety.alertType,
      reason: staticSafety.message,
      message: staticSafety.message,
      userMessage,
      stage: body.currentStage
    });
  }

  if (needsMoreSpecificAnswer(body.message)) {
    const retryMessage = buildRetryMessage(body.config, body.currentStage);
    return Response.json({
      blocked: false,
      userMessage,
      assistantMessage: createAssistantMessage(retryMessage, body.currentStage),
      stage: body.currentStage,
      shouldCreatePrompt: false,
      isFinal: false,
      aiLog: createAiLog("question_polish", body.currentStage, false, "needs_more_specific_answer")
    });
  }

  const historyWithInput = [...body.history, userMessage];
  const flow = getNextFlow({
    config: body.config,
    history: historyWithInput,
    studentInput: body.message,
    currentStage: body.currentStage,
    latestPrompt: body.latestPrompt,
    loopCount: body.loopCount
  });

  const aiCallCount = body.aiCallCount ?? body.history.filter((message) => message.role === "assistant").length;
  const baseText = flow.draftPrompt ?? flow.assistantMessage;
  const ai = await maybeAssistWithAi({
    config: body.config,
    stage: flow.nextStage,
    purpose: flow.aiPurpose,
    baseText,
    history: historyWithInput,
    aiCallCount
  });

  const assistantText = flow.draftPrompt ? flow.assistantMessage.replace(flow.draftPrompt, ai.text) : ai.text;
  const draftPrompt = flow.shouldCreatePrompt ? ai.text : undefined;
  const promptSource: PromptSource | undefined = flow.shouldCreatePrompt ? (ai.used ? "ai_assisted" : flow.promptSource ?? "rule") : undefined;

  return Response.json({
    blocked: false,
    userMessage,
    assistantMessage: createAssistantMessage(assistantText, flow.nextStage),
    stage: flow.nextStage,
    draftPrompt,
    promptSource,
    shouldCreatePrompt: flow.shouldCreatePrompt,
    isFinal: flow.isFinal,
    aiLog: createAiLog(flow.aiPurpose ?? "question_polish", flow.nextStage, ai.used, ai.fallbackReason)
  });
}

function createAssistantMessage(content: string, stage: Stage): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    stage,
    createdAt: new Date().toISOString()
  };
}

function createAiLog(purpose: AiAssistLog["purpose"], stage: Stage, used: boolean, fallbackReason?: string): AiAssistLog {
  return {
    id: crypto.randomUUID(),
    provider: "gemini",
    purpose,
    stage,
    used,
    fallbackReason,
    createdAt: new Date().toISOString()
  };
}

function needsMoreSpecificAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|대충|글쎄|잘모르겠어|잘모름|응|네|ㅇㅇ|ㄴㄴ|\?+|!+)$/.test(normalized) || normalized.length < 2;
}

function buildRetryMessage(config: SessionConfig, currentStage: Stage) {
  const currentQuestion = getQuestionForStage(config, currentStage);
  return `좋아요. 아직은 조금 짧아서 프롬프트로 만들기 어려워요. 떠오르는 장면이나 이유를 한 가지만 더 말해줄래요?\n\n${currentQuestion}`;
}
