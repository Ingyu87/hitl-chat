import { maybeAssistWithAi } from "@/lib/ai-assist";
import { getNextFlow } from "@/lib/flow";
import { getQuestionForStage } from "@/lib/question-flow";
import { checkSafety } from "@/lib/safety";
import { callGeminiText, parseJsonObject } from "@/lib/gemini";
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
  studentMessage: string;
};

type AiModeration = {
  category: "safe" | "profanity" | "sexual" | "abusive" | "meaningless" | "off_topic";
  reason: string;
  studentMessage: string;
};

const moderationSchema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: ["safe", "profanity", "sexual", "abusive", "meaningless", "off_topic"] },
    reason: { type: "STRING" },
    studentMessage: { type: "STRING" }
  },
  required: ["category", "reason", "studentMessage"]
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

  const problem = await classifyProblemAnswer(body);
  if (problem) {
    return Response.json({
      blocked: false,
      userMessage,
      warning: {
        alertType: problem.alertType,
        reason: problem.reason
      },
      assistantMessage: createAssistantMessage(problem.studentMessage, body.currentStage),
      stage: body.currentStage,
      shouldCreatePrompt: false,
      isFinal: false,
      aiLog: createAiLog("safety_check", body.currentStage, false, problem.alertType)
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

async function classifyProblemAnswer(body: ChatBody): Promise<ChatWarning | null> {
  const staticSafety = checkSafety(body.message);
  if (!staticSafety.isSafe && staticSafety.alertType && staticSafety.message) {
    return {
      alertType: staticSafety.alertType,
      reason: staticSafety.message,
      studentMessage: staticSafety.message
    };
  }

  const staticWarning = classifyWeakAnswer(body.message, body.config, body.currentStage);
  if (staticWarning) return staticWarning;

  const aiWarning = await classifyWithAi(body);
  if (aiWarning) return aiWarning;

  return null;
}

async function classifyWithAi(body: ChatBody): Promise<ChatWarning | null> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GOOGLE_API_KEY) return null;

  try {
    const currentFlow = getQuestionForStage(body.config, body.currentStage);
    const recent = body.history
      .slice(-6)
      .map((message) => `${message.role === "user" ? "학생" : "챗봇"}: ${message.content}`)
      .join("\n");
    const prompt = [
      "너는 수업용 챗봇의 학생 답변을 분류하는 한국어 안전/관련성 판정기다.",
      "학생 답변을 아래 범주 중 하나로 분류한다.",
      "",
      "범주:",
      "- safe: 수업 주제와 어느 정도 관련 있고 다음 대화로 진행 가능",
      "- profanity: 욕설, 비속어, 저속한 표현",
      "- sexual: 음란하거나 성적인 표현",
      "- abusive: 폭언, 모욕, 위협, 괴롭힘",
      "- meaningless: 무의미한 단어, 장난, 너무 짧거나 생각이 없는 답변",
      "- off_topic: 질문/수업 주제와 관련 없는 동문서답",
      "",
      "studentMessage는 학생에게 바로 보여줄 단호하지만 교육적인 한두 문장으로 작성한다. 문제 행동을 분명히 말하고, 같은 단계에서 다시 답하게 한다.",
      "반드시 JSON만 출력한다.",
      "",
      `수업 주제: ${body.config.topic}`,
      `현재 단계 흐름: ${currentFlow}`,
      "최근 대화:",
      recent || "없음",
      `학생 답변: ${body.message}`
    ].join("\n");

    const text = await callGeminiText(prompt, {
      temperature: 0,
      maxOutputTokens: 360,
      responseMimeType: "application/json",
      responseSchema: moderationSchema
    });
    const result = parseJsonObject<AiModeration | null>(text, null);
    if (!result || result.category === "safe") return null;

    return {
      alertType: result.category,
      reason: result.reason || defaultReason(result.category),
      studentMessage: result.studentMessage || defaultStudentMessage(result.category, body.config, body.currentStage)
    };
  } catch {
    return null;
  }
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

function classifyWeakAnswer(input: string, config: SessionConfig, stage: Stage): ChatWarning | null {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();

  if (
    /^(몰라|모름|없음|아무거나|아무생각없어|아무생각이없어|생각없어|대충|글쎄|잘모르겠어|잘모름|누구야|너누구야|응|네|ㅇㅇ|ㄴㄴ|\?+|!+)$/.test(
      normalized
    )
  ) {
    return {
      alertType: "meaningless",
      reason: "학생이 무성의하거나 의미를 파악하기 어려운 답변을 입력했습니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage)
    };
  }

  if (normalized.length < 5) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 프롬프트를 만들기에는 너무 짧습니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage)
    };
  }

  const topicWords = config.topic
    .split(/[\s,./|]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const hasTopicWord = topicWords.some((word) => input.includes(word));
  const hasVisualClue = /(장면|그림|이미지|색|분위기|사람|학생|교사|선생님|장소|교실|AI|인공지능|안전|활용|문제|해결|모습|행동|느낌|화풍|스타일|구도|시점|밝은|어두운|만화|사진|수채화|픽셀)/i.test(input);

  if (!hasTopicWord && !hasVisualClue && input.length < 15) {
    return {
      alertType: "off_topic",
      reason: "학생 답변이 수업 주제나 이미지 프롬프트 활동과 관련이 약합니다.",
      studentMessage: defaultStudentMessage("off_topic", config, stage)
    };
  }

  return null;
}

function defaultReason(category: AiModeration["category"]) {
  if (category === "profanity") return "욕설 또는 비속어가 포함되어 있습니다.";
  if (category === "sexual") return "음란하거나 성적인 표현이 포함되어 있습니다.";
  if (category === "abusive") return "폭언, 모욕, 위협 또는 괴롭힘 표현이 포함되어 있습니다.";
  if (category === "meaningless") return "무의미하거나 무성의한 답변입니다.";
  if (category === "off_topic") return "질문 또는 수업 주제와 관련 없는 답변입니다.";
  return "수업 진행에 적절하지 않은 답변입니다.";
}

function defaultStudentMessage(category: Exclude<AiModeration["category"], "safe">, config: SessionConfig, stage: Stage) {
  const currentQuestion = retryQuestionForStage(config, stage);
  const lead =
    category === "profanity"
      ? "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 표현을 바꿔서 다시 답해 주세요."
      : category === "sexual"
        ? "음란하거나 성적인 내용은 이 활동에서 다룰 수 없어요. 수업 주제에 맞게 다시 답해 주세요."
        : category === "abusive"
          ? "폭언, 모욕, 위협하는 말은 허용되지 않아요. 상대를 존중하는 표현으로 다시 답해 주세요."
          : category === "off_topic"
            ? "지금 답변은 질문이나 수업 주제와 연결이 약해요. 주제와 관련된 장면으로 다시 생각해 주세요."
            : "아직은 프롬프트로 만들기 어려울 만큼 답변이 짧거나 모호해요. 장면이나 이유를 한 가지만 더 구체적으로 말해 주세요.";

  return `${lead}\n\n${currentQuestion}`;
}

function retryQuestionForStage(config: SessionConfig, stage: Stage) {
  if (stage === "explore") return `"${config.topic}"과 연결해서 어떤 장소, 사람, 상황이 보이면 좋을지 다시 말해 주세요.`;
  if (stage === "concrete") return "그 장면에서 누가, 어디에서, 무엇을 하고 있는지 구체적으로 다시 말해 주세요.";
  if (stage === "describe") return "그림의 색감, 분위기, 구도, 시점, 화풍이나 스타일을 다시 생각해서 말해 주세요.";
  if (stage === "draft" || stage === "revise") return "프롬프트에 추가하거나 바꾸고 싶은 내용을 수업 주제와 연결해서 다시 말해 주세요.";
  return `"${config.topic}"을 이미지로 표현한다면 어떤 장면이 떠오르는지 다시 말해 주세요.`;
}
