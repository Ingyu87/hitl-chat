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
  isSafetyAlert: boolean;
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
    const response = {
      blocked: false,
      clarification: !problem.isSafetyAlert,
      userMessage,
      assistantMessage: createAssistantMessage(problem.studentMessage, body.currentStage),
      stage: body.currentStage,
      shouldCreatePrompt: false,
      isFinal: false,
      aiLog: createAiLog("safety_check", body.currentStage, false, problem.alertType)
    };

    if (!problem.isSafetyAlert) return Response.json(response);

    return Response.json({
      ...response,
      warning: {
        alertType: problem.alertType,
        reason: problem.reason
      }
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
      studentMessage: staticSafety.message,
      isSafetyAlert: true
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
      "환경 문제 묘사, 오염, 쓰레기, 냄새, 위험한 장면 묘사는 수업 주제 장면일 수 있으므로 욕설/모욕으로 판단하지 않는다.",
      "짧거나 모호한 답변은 안전 경고가 아니라 재질문 대상으로 분류한다.",
      "반드시 JSON만 출력한다.",
      "",
      "범주:",
      "- safe: 수업 주제와 어느 정도 관련 있고 다음 대화로 진행 가능",
      "- profanity: 욕설, 비속어, 저속한 표현",
      "- sexual: 음란하거나 성적인 표현",
      "- abusive: 사람을 향한 폭언, 모욕, 위협, 괴롭힘",
      "- meaningless: 무의미한 단어, 너무 짧거나 모호한 답변",
      "- off_topic: 질문/수업 주제와 관련 없는 동문서답",
      "",
      `수업 주제: ${body.config.topic}`,
      `현재 질문: ${currentFlow}`,
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
      studentMessage: result.studentMessage || defaultStudentMessage(result.category, body.config, body.currentStage),
      isSafetyAlert: !["meaningless", "off_topic"].includes(result.category)
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
  if (isValidVisualScene(input, config)) return null;

  if (/^(몰라|모름|없음|아무거나|아무생각없어|아무생각이없어|생각없어|대충|글쎄|잘모르겠어|잘모름|\?+|!+)$/.test(normalized)) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 아직 프롬프트 재료로 쓰기에는 모호합니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  if (normalized.length < 5) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 짧아 재질문이 필요합니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  return null;
}

function isValidVisualScene(input: string, config: SessionConfig) {
  const text = input.trim();
  if (text.length < 5) return false;
  const topicWords = config.topic
    .split(/[\s,./|]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const hasTopicWord = topicWords.some((word) => text.includes(word));
  const hasSceneWord = /바다|숲|강|하늘|교실|마을|도시|사람|학생|동물|물고기|돌고래|장면|모습|그림|이미지|색|빛|분위기|쓰레기|오염|냄새|위험|플라스틱|폐수|죽은|깨끗|미래|해결|줍는|보여/.test(text);
  const hasActionOrDescriptor = /떠다니|뛰어|줍|보여|있는|없는|냄새|밝|어둡|더럽|깨끗|위험|멋진|슬픈|희망|오염/.test(text);
  return hasSceneWord && (hasActionOrDescriptor || hasTopicWord || text.length >= 12);
}

function defaultReason(category: AiModeration["category"]) {
  if (category === "profanity") return "욕설 또는 비속어가 포함되어 있습니다.";
  if (category === "sexual") return "성적인 표현이 포함되어 있습니다.";
  if (category === "abusive") return "위협, 모욕, 혐오 표현이 포함되어 있습니다.";
  if (category === "meaningless") return "답변이 아직 구체적이지 않습니다.";
  if (category === "off_topic") return "질문 또는 수업 주제와 관련이 약한 답변입니다.";
  return "수업 진행에 맞게 다시 확인이 필요한 답변입니다.";
}

function defaultStudentMessage(category: Exclude<AiModeration["category"], "safe">, config: SessionConfig, stage: Stage) {
  if (category === "profanity") return "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 표현을 바꾸어 다시 말해 주세요.";
  if (category === "sexual") return "성적인 내용은 이 활동에서 사용할 수 없어요. 수업 주제에 맞는 장면으로 다시 말해 주세요.";
  if (category === "abusive") return "위협, 모욕, 혐오 표현은 사용할 수 없어요. 상대를 존중하는 표현으로 다시 말해 주세요.";

  return `질문이 애매했을 수 있어요. 아래 선택지를 골라도 좋고, 떠오르는 장면을 한 문장으로 말해도 좋아요.\n\n${getQuestionForStage(config, stage)}`;
}
