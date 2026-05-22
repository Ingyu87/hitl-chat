import { maybeAssistWithAi } from "@/lib/ai-assist";
import { getNextFlow } from "@/lib/flow";
import { getQuestionForStage } from "@/lib/question-flow";
import { checkSafety } from "@/lib/safety";
import type { AiAssistLog, ChatMessage, PromptSource, SafetyAlert, SessionConfig, Stage } from "@/lib/types";

type ChatBody = {
  config: SessionConfig;
  history: ChatMessage[];
  message: string;
  currentStage: Stage;
  latestPrompt?: string;
  loopCount: number;
  aiCallCount?: number;
};

type ChatWarning = {
  alertType: SafetyAlert["alertType"];
  reason: string;
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

  const warning = classifyWeakAnswer(body.message, body.config);
  if (warning) {
    const retryMessage = buildRetryMessage(body.config, body.currentStage, warning);
    return Response.json({
      blocked: false,
      userMessage,
      warning,
      assistantMessage: createAssistantMessage(retryMessage, body.currentStage),
      stage: body.currentStage,
      shouldCreatePrompt: false,
      isFinal: false,
      aiLog: createAiLog("question_polish", body.currentStage, false, warning.alertType)
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

function classifyWeakAnswer(input: string, config: SessionConfig): ChatWarning | null {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();

  if (
    /^(몰라|모름|없음|아무거나|아무생각없어|아무생각이없어|생각없어|대충|글쎄|잘모르겠어|잘모름|누구야|너누구야|응|네|ㅇㅇ|ㄴㄴ|\?+|!+)$/.test(
      normalized
    )
  ) {
    return {
      alertType: "meaningless",
      reason: "학생이 무성의하거나 의미를 파악하기 어려운 답변을 입력했습니다."
    };
  }

  if (normalized.length < 5) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 프롬프트를 만들기에는 너무 짧습니다."
    };
  }

  const topicWords = config.topic
    .split(/[\s,./|]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const hasTopicWord = topicWords.some((word) => input.includes(word));
  const hasVisualClue = /(장면|그림|이미지|색|분위기|사람|학생|교사|선생님|장소|교실|AI|인공지능|안전|활용|문제|해결|모습|행동|느낌)/i.test(input);

  if (!hasTopicWord && !hasVisualClue && input.length < 15) {
    return {
      alertType: "off_topic",
      reason: "학생 답변이 수업 주제나 이미지 프롬프트 활동과 관련이 약합니다."
    };
  }

  return null;
}

function buildRetryMessage(config: SessionConfig, currentStage: Stage, warning: ChatWarning) {
  const currentQuestion = getQuestionForStage(config, currentStage);
  const prefix =
    warning.alertType === "off_topic"
      ? "그 답변은 이번 주제와 조금 멀어 보여요. 수업 주제와 연결해서 다시 말해볼까요?"
      : "아직은 프롬프트로 만들기 어려울 만큼 답변이 짧거나 모호해요. 장면이나 이유를 한 가지만 더 구체적으로 말해줄래요?";

  return `${prefix}\n\n${currentQuestion}`;
}
