import { maybeAssistWithAi } from "@/lib/ai-assist";
import { callAiJson, getAiProvider, hasAiApiKey } from "@/lib/ai-provider";
import { getNextFlow } from "@/lib/flow";
import { getChoicesForStage, getQuestionForStage } from "@/lib/question-flow";
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
  if ((body.currentStage === "revise" || body.currentStage === "final") && isStudentControlCommand(body.message)) {
    if (body.latestPrompt) return null;
    return {
      alertType: "meaningless",
      reason: "아직 확정할 이미지 프롬프트 초안이 없습니다.",
      studentMessage: "아직 확정할 프롬프트 초안이 없어요. 먼저 질문에 맞춰 떠오르는 장면이나 생각을 적어 주세요.",
      isSafetyAlert: false
    };
  }

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

function isStudentControlCommand(input: string) {
  return /(이대로확정|최종확정|확정|좋아|괜찮아|완성|최종|프롬프트|결과|만들어|작성|보여|알려|ok|yes)/i.test(input.replace(/\s/g, ""));
}

async function classifyWithAi(body: ChatBody): Promise<ChatWarning | null> {
  if (!hasAiApiKey() || isChoiceAnswer(body.message, body.config, body.currentStage) || isValidShortAnswerForQuestion(body.message, body.config, body.currentStage)) return null;

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
      "off_topic: The answer is coherent but clearly unrelated to the lesson topic or current question.",
      "meaningless: The answer is random text, empty, repeated characters, or a non-answer regardless of topic.",
      "Every reason and studentMessage value must be written in Korean.",
      "",
      `Lesson topic: ${body.config.topic}`,
      `Current question: ${currentFlow}`,
      "Recent conversation:",
      recent || "none",
      `Student answer: ${body.message}`,
      "",
      'Return shape: {"category":"safe","reason":"짧은 한국어 이유","studentMessage":"학생에게 보여줄 한국어 메시지"}'
    ].join("\n");

    const result = await callAiJson<AiModeration | null>(prompt, null, {
      temperature: 0,
      maxOutputTokens: 360,
      responseSchema: moderationSchema
    });
    if (!result || result.category === "safe") return null;

    return {
      alertType: result.category,
      reason: result.reason || fallbackReasonText(result.category),
      studentMessage: result.studentMessage || fallbackStudentMessage(result.category, body.config, body.currentStage),
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
    provider: getAiProvider(),
    purpose,
    stage,
    used,
    fallbackReason,
    createdAt: new Date().toISOString()
  };
}

function classifyWeakAnswer(input: string, config: SessionConfig, stage: Stage): ChatWarning | null {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  if (isChoiceAnswer(input, config, stage)) return null;
  if (isValidShortAnswerForQuestion(input, config, stage)) return null;
  if (isValidVisualScene(input, config)) return null;

  if (isAnswerRequest(normalized)) {
    return {
      alertType: "meaningless",
      reason: "학생이 자기 생각 대신 정답이나 완성본을 요구했습니다.",
      studentMessage: answerRequestMessage(config, stage),
      isSafetyAlert: false
    };
  }

  if (isClearlyMeaningless(normalized)) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 프롬프트 재료로 사용하기에 너무 모호합니다.",
      studentMessage: fallbackStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  if (normalized.length < 5) {
    return {
      alertType: "meaningless",
      reason: "학생 답변이 짧아 자세한 문장이 필요합니다.",
      studentMessage: fallbackStudentMessage("meaningless", config, stage),
      isSafetyAlert: false
    };
  }

  return null;
}

function isChoiceAnswer(input: string, config: SessionConfig, stage: Stage) {
  const normalized = normalizeForCompare(input);
  return getChoicesForStage(config, stage).some((choice) => {
    const label = normalizeForCompare(choice.label);
    const value = normalizeForCompare(choice.value);
    return normalized === label || normalized === value || Boolean(label && normalized.includes(label));
  });
}

function normalizeForCompare(input: string) {
  return input.trim().replace(/\s+/g, "").toLowerCase();
}

function isValidShortAnswerForQuestion(input: string, config: SessionConfig, stage: Stage) {
  const text = input.trim();
  if (!text) return false;

  const question = getQuestionForStage(config, stage);
  if (isStyleQuestion(question) && isStyleAnswer(text)) return true;
  if (isCompositionQuestion(question) && isCompositionAnswer(text)) return true;
  if (isMoodQuestion(question) && isMoodAnswer(text)) return true;

  return false;
}

function isStyleQuestion(question: string) {
  return /스타일|그림체|화풍|분위기|색감|구도|시점/.test(question);
}

function isStyleAnswer(input: string) {
  return /픽셀\s*아트|픽셀아트|수채화|만화|카툰|사진|실사|포스터|일러스트|디지털|연필|크레파스|유화|스케치|애니|3d|입체|현실적|귀엽|따뜻|밝|어둡|선명/.test(input);
}

function isCompositionQuestion(question: string) {
  return /구도|시점|거리|화면|앞쪽|배경|중심/.test(question);
}

function isCompositionAnswer(input: string) {
  return /가로|세로|중앙|가까이|멀리|위에서|아래에서|앞쪽|뒤쪽|배경|중심|한눈에|넓게|크게/.test(input);
}

function isMoodQuestion(question: string) {
  return /분위기|느낌|색감|밝|어둡|따뜻|차가운/.test(question);
}

function isMoodAnswer(input: string) {
  return /밝|어둡|따뜻|차갑|희망|평화|긴장|즐거|무서|차분|신나|깨끗|선명|부드럽/.test(input);
}

function isAnswerRequest(normalized: string) {
  const answerRequestTerms = [
    "정답알려줘",
    "답알려줘",
    "답변해줘",
    "대답해줘",
    "대신써줘",
    "대신해줘",
    "너가해",
    "니가해",
    "네가해",
    "알아서해",
    "만들어줘",
    "작성해줘",
    "써줘",
    "뭐라고써",
    "뭐라고적어",
    "모범답안",
    "정답"
  ];
  return answerRequestTerms.some((term) => normalized.includes(term));
}

function answerRequestMessage(config: SessionConfig, stage: Stage) {
  return `정답을 바로 알려 달라고 하기보다, 지금 떠오르는 생각을 네 말로 적어 주세요. 한 문장이어도 괜찮아요. 그 답변을 바탕으로 같이 프롬프트를 만들어 갈게요.\n\n${getQuestionForStage(config, stage)}`;
}

function isClearlyMeaningless(normalized: string) {
  if (!normalized) return true;
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
  if (/^[ㅋㅎㅠㅜㅗㅓㅏㅣㅡ]+$/.test(normalized)) return true;
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
  const hasSceneWord = /바다|강|하늘|교실|마을|도시|사람|학생|동물|물고기|상황|모습|그림|이미지|빛|분위기|쓰레기|오염|위험|플라스틱|자연|죽은|미래|해결|초원|음식|파티|스타일|픽셀|수채화|사진|보여/.test(text);
  const hasActionOrDescriptor = /하고|먹|즐기|보여|움직|밝|어둡|더럽|깨끗|위험|멋진|슬픈|희망|평화|신나|역동|해결|그리/.test(text);
  return hasSceneWord && (hasActionOrDescriptor || hasTopicWord || text.length >= 12);
}

function fallbackReasonText(category: AiModeration["category"]) {
  if (category === "profanity") return "욕설 또는 비속어가 포함되어 있습니다.";
  if (category === "sexual") return "음란하거나 성적인 표현이 포함되어 있습니다.";
  if (category === "abusive") return "폭언, 모욕, 혐오 표현이 포함되어 있습니다.";
  if (category === "meaningless") return "답변이 아직 구체적이지 않습니다.";
  if (category === "off_topic") return "수업 주제나 현재 질문과 관련이 약합니다.";
  return "수업 진행에 맞게 다시 확인이 필요한 답변입니다.";
}

function fallbackStudentMessage(category: Exclude<AiModeration["category"], "safe">, config: SessionConfig, stage: Stage) {
  if (category === "profanity") return "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 같은 생각이라도 바른 말로 바꾸어 다시 적어 주세요.";
  if (category === "sexual") return "음란하거나 성적인 표현은 이 수업 활동에서 사용할 수 없어요. 오늘 수업 주제에 맞는 안전한 장면으로 다시 적어 주세요.";
  if (category === "abusive") return "폭언, 모욕, 혐오 표현은 사용할 수 없어요. 사람을 존중하는 표현으로 바꾸어 다시 적어 주세요.";
  if (category === "off_topic") {
    return `지금 답변은 수업 주제와 조금 멀어 보여요. "${config.topic}"와 연결되는 장면이나 생각으로 다시 적어 주세요.\n\n${getQuestionForStage(config, stage)}`;
  }

  return `아무 말이나 쓰기보다, 지금 질문에 맞춰 떠오르는 장면이나 생각을 네 말로 적어 주세요. 짧아도 괜찮아요.\n\n${getQuestionForStage(config, stage)}`;
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
  if (category === "off_topic") {
    return `지금 답변은 수업 주제와 조금 멀어 보여요. "${config.topic}"와 연결되는 장면이나 생각으로 다시 말해 주세요.\n\n${getQuestionForStage(config, stage)}`;
  }

  return `질문에 어울리는 답이 필요해요. 원하는 장면이나 생각을 한 문장으로 다시 말해 주세요.\n\n${getQuestionForStage(config, stage)}`;
}
