import { maybeAssistWithAi } from "@/lib/ai-assist";
import { getNextFlow } from "@/lib/flow";
import { getQuestionForStage } from "@/lib/question-flow";
import { checkSafety } from "@/lib/safety";
import { callGeminiJson } from "@/lib/gemini";
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
    if (problem.isSafetyAlert) {
      return Response.json({
        blocked: true,
        alertType: problem.alertType,
        reason: problem.reason,
        message: problem.studentMessage,
        stage: body.currentStage,
        shouldCreatePrompt: false,
        isFinal: false,
        aiLog: createAiLog("safety_check", body.currentStage, false, problem.alertType)
      });
    }

    return Response.json({
      blocked: false,
      clarification: true,
      userMessage,
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
      .map((message) => `${message.role}(${message.stage}): ${message.content}`)
      .join("\n");
    const prompt = [
      "You classify a Korean student's classroom answer for safety and relevance.",
      "Return JSON only. No markdown.",
      "Categories: safe, profanity, sexual, abusive, meaningless, off_topic.",
      "Environmental words such as trash, pollution, danger, dead fish, or dirty ocean are safe when used for the lesson topic.",
      "Classify sexual/nudity requests as sexual even if phrased as an image idea.",
      "Classify random strings, empty answers, or unserious answers as meaningless.",
      "",
      `Lesson topic: ${body.config.topic}`,
      `Current question: ${currentFlow}`,
      "Recent conversation:",
      recent || "none",
      `Student answer: ${body.message}`,
      "",
      'Return shape: {"category":"safe","reason":"short Korean reason","studentMessage":"Korean message to show the student"}'
    ].join("\n");

    const result = await callGeminiJson<AiModeration | null>(prompt, null, {
      temperature: 0,
      maxOutputTokens: 360,
      responseSchema: moderationSchema
    });
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

  if (isClearlyMeaningless(normalized)) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 프롬프트 재료로 사용하기에 너무 모호합니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  if (normalized.length < 5) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 짧아 자세한 문장이 필요합니다.",
      studentMessage: defaultStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  return null;
}

function isClearlyMeaningless(normalized: string) {
  if (!normalized) return false;
  const meaninglessTerms = [
    "\ubab0\ub77c",
    "\ubaa8\ub984",
    "\uc5c6\uc74c",
    "\uc544\ubb34\uac70\ub098",
    "\uc544\ubb34\uc0dd\uac01\uc5c6\uc5b4",
    "\uc0dd\uac01\uc5c6\uc5b4",
    "\ub300\ucda9",
    "\uae00\uc384",
    "\uc798\ubaa8\ub974\uaca0\uc5b4",
    "\uc798\ubaa8\ub984",
    "\ub108\uac00\ud574",
    "\ub2c8\uac00\ud574",
    "asdf",
    "qwer",
    "test"
  ];
  if (meaninglessTerms.some((term) => normalized.includes(term))) return true;
  if (/^[ㅋㅎㅠㅜ]+$/.test(normalized)) return true;
  if (/^[?.!,~\-_=+]+$/.test(normalized)) return true;
  if (/^(.)\1{4,}$/.test(normalized)) return true;
  return false;
}

function isValidVisualScene(input: string, config: SessionConfig) {
  const text = input.trim();
  if (text.length < 5) return false;
  const topicWords = config.topic
    .split(/[\s,./|]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
  const hasTopicWord = topicWords.some((word) => text.includes(word));
  const hasSceneWord = /바다|강|하늘|교실|마을|도시|사람|학생|동물|물고기|상황|모습|그림|이미지|빛|분위기|쓰레기|오염|위험|플라스틱|자연|죽은|미래|해결|보여/.test(text);
  const hasActionOrDescriptor = /있|없|보여|움직|밝|어둡|더럽|깨끗|위험|멋진|슬픈|희망|해결/.test(text);
  return hasSceneWord && (hasActionOrDescriptor || hasTopicWord || text.length >= 12);
}

function defaultReason(category: AiModeration["category"]) {
  if (category === "profanity") return "욕설 또는 비속어가 포함되어 있습니다.";
  if (category === "sexual") return "성적인 표현이 포함되어 있습니다.";
  if (category === "abusive") return "폭언, 모욕, 혐오 표현이 포함되어 있습니다.";
  if (category === "meaningless") return "답변이 아직 구체적이지 않습니다.";
  if (category === "off_topic") return "질문 또는 수업 주제와 관련이 약한 답변입니다.";
  return "수업 진행에 맞게 다시 확인이 필요한 답변입니다.";
}

function defaultStudentMessage(category: Exclude<AiModeration["category"], "safe">, config: SessionConfig, stage: Stage) {
  if (category === "profanity") return "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 표현을 바꿔서 다시 말해 주세요.";
  if (category === "sexual") return "성적인 내용은 이 수업 활동에서 사용할 수 없어요. 수업 주제에 맞는 장면으로 다시 말해 주세요.";
  if (category === "abusive") return "폭언, 모욕, 혐오 표현은 사용할 수 없어요. 상대를 존중하는 표현으로 다시 말해 주세요.";

  return `질문에 어울리는 답이 필요해요. 원하는 장면을 한 문장으로 다시 말해 주세요.\n\n${getQuestionForStage(config, stage)}`;
}
