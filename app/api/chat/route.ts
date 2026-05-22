import { getNextFlow } from "@/lib/flow";
import { callGeminiText, parseJsonObject } from "@/lib/gemini";
import { checkSafety } from "@/lib/safety";
import type { ChatMessage, SafetyAlert, SessionConfig, Stage } from "@/lib/types";

type ChatBody = {
  config: SessionConfig;
  history: ChatMessage[];
  message: string;
  currentStage: Stage;
  latestPrompt?: string;
  loopCount: number;
};

type AiChatResult = {
  blocked: boolean;
  alertType?: SafetyAlert["alertType"];
  reason?: string;
  assistantMessage: string;
  draftPrompt?: string;
  shouldStayOnCurrentStage?: boolean;
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
      assistantMessage: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: retryMessage,
        stage: body.currentStage,
        createdAt: new Date().toISOString()
      },
      stage: body.currentStage,
      shouldCreatePrompt: false,
      isFinal: false,
      aiLog: {
        id: crypto.randomUUID(),
        provider: "gemini",
        purpose: "question_polish",
        stage: body.currentStage,
        used: false,
        fallbackReason: "needs_more_specific_answer",
        createdAt: new Date().toISOString()
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

  const fallbackDraft = flow.draftPrompt;
  const fallbackText = flow.assistantMessage;
  let aiResult: AiChatResult | null = null;

  try {
    aiResult = await getAiChatResult({
      config: body.config,
      history: historyWithInput,
      currentStage: body.currentStage,
      nextStage: flow.nextStage,
      latestPrompt: body.latestPrompt,
      loopCount: body.loopCount,
      fallbackText,
      fallbackDraft
    });
  } catch {
    aiResult = null;
  }

  if (aiResult?.blocked) {
    return Response.json({
      blocked: true,
      alertType: aiResult.alertType ?? "off_topic",
      reason: aiResult.reason ?? "AI가 수업 흐름에 맞지 않는 입력으로 판단했습니다.",
      message: aiResult.assistantMessage,
      userMessage,
      stage: body.currentStage
    });
  }

  const responseStage = aiResult?.shouldStayOnCurrentStage ? body.currentStage : flow.nextStage;
  const shouldCreatePrompt = aiResult?.shouldStayOnCurrentStage ? false : flow.shouldCreatePrompt;
  const draftPrompt = shouldCreatePrompt ? aiResult?.draftPrompt || fallbackDraft : undefined;
  const assistantText = aiResult?.assistantMessage || fallbackText;

  return Response.json({
    blocked: false,
    userMessage,
    assistantMessage: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantText,
      stage: responseStage,
      createdAt: new Date().toISOString()
    },
    stage: responseStage,
    draftPrompt,
    promptSource: shouldCreatePrompt ? "ai_assisted" : undefined,
    shouldCreatePrompt,
    isFinal: aiResult?.shouldStayOnCurrentStage ? false : flow.isFinal,
    aiLog: {
      id: crypto.randomUUID(),
      provider: "gemini",
      purpose: shouldCreatePrompt ? "draft_prompt" : "question_polish",
      stage: responseStage,
      used: Boolean(aiResult),
      fallbackReason: aiResult ? undefined : "fallback_rule",
      createdAt: new Date().toISOString()
    }
  });
}

async function getAiChatResult(args: {
  config: SessionConfig;
  history: ChatMessage[];
  currentStage: Stage;
  nextStage: Stage;
  latestPrompt?: string;
  loopCount: number;
  fallbackText: string;
  fallbackDraft?: string;
}): Promise<AiChatResult> {
  const prompt = [
    "너는 초등학생과 대화하는 프롬프트 작성 수업 챗봇이다.",
    "학생 답변을 대신 작성하거나 새로운 핵심 아이디어를 만들어주지 않는다.",
    "교사가 설정한 질문 흐름을 따르되, 학생의 직전 답변 맥락에 맞게 자연스럽게 이어 묻는다.",
    "학생의 직전 답변이 거절, 장난, 너무 짧은 대답, 질문에 대한 실제 답이 아닌 경우 다음 단계로 넘어가지 말고 shouldStayOnCurrentStage=true로 둔다.",
    "shouldStayOnCurrentStage=true일 때는 학생을 꾸짖지 말고 현재 단계 질문을 더 쉽게 다시 묻는다.",
    "학생 입력에 욕설, 혐오, 위험 표현, 무의미 반복, 심한 주제 이탈, 이상하거나 부적절한 용어가 있으면 blocked=true로 판단한다.",
    "blocked=true일 때는 쉬운 말로 왜 다시 써야 하는지 안내하고, alertType은 profanity/off_topic/meaningless 중 하나로 둔다.",
    "프롬프트 초안/수정본을 만들 때는 학생이 실제로 말한 내용과 교사 조건만 사용한다.",
    "반드시 JSON 객체만 출력한다.",
    "",
    `수업 주제: ${args.config.topic}`,
    `학습 목표: ${args.config.learningGoal}`,
    `최종 산출물: ${args.config.outputType}`,
    `필수 포함 요소: ${args.config.requiredElements.join(", ") || "없음"}`,
    `주의 요소: ${args.config.constraints.join(", ") || "없음"}`,
    `현재 단계: ${args.currentStage}`,
    `다음 단계: ${args.nextStage}`,
    `수정 횟수: ${args.loopCount}/${args.config.maxLoopCount}`,
    `기존 프롬프트: ${args.latestPrompt || "없음"}`,
    "",
    "교사 질문 흐름:",
    args.config.questionFlow.map((item, index) => `${index + 1}. ${item.label}: ${item.question}`).join("\n"),
    "",
    "전체 대화:",
    args.history.map((message) => `${message.role === "user" ? "학생" : "챗봇"}(${message.stage}): ${message.content}`).join("\n"),
    "",
    "규칙 기반 기본 응답:",
    args.fallbackText,
    "",
    "JSON 형식:",
    '{"blocked":false,"alertType":"off_topic","reason":"","shouldStayOnCurrentStage":false,"assistantMessage":"학생에게 보여줄 응답","draftPrompt":"프롬프트 초안 또는 수정본. 없으면 빈 문자열"}'
  ].join("\n");

  const text = await callGeminiText(prompt, { temperature: 0.35, maxOutputTokens: 1200 });
  const parsed = parseJsonObject<AiChatResult>(text, {
    blocked: false,
    assistantMessage: args.fallbackText,
    draftPrompt: args.fallbackDraft
  });

  if (!parsed.assistantMessage) {
    parsed.assistantMessage = args.fallbackText;
  }

  if (args.nextStage === "revise" && args.fallbackDraft && !parsed.draftPrompt) {
    parsed.draftPrompt = args.fallbackDraft;
  }

  return parsed;
}

function needsMoreSpecificAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(싫어|시러|싫음|몰라|모름|없어|없음|안해|안함|귀찮아|귀찮|네|아니|응|ㅇㅇ|ㄴㄴ|ㅋ+|ㅎ+)$/.test(normalized);
}

function buildRetryMessage(config: SessionConfig, currentStage: Stage) {
  const currentQuestion = config.questionFlow.find((item) => item.stage === currentStage)?.question;
  if (currentQuestion) {
    return `괜찮아. 길게 쓰지 않아도 돼. 네 생각이 보이도록 한 문장만 적어줘.\n\n${currentQuestion}`;
  }

  return `괜찮아. 길게 쓰지 않아도 돼. "${config.topic}"에 대해 네가 떠올린 생각을 한 문장으로 적어줘.`;
}
