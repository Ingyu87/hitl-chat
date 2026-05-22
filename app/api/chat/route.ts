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

  const draftPrompt = flow.shouldCreatePrompt ? aiResult?.draftPrompt || fallbackDraft : undefined;
  const assistantText = aiResult?.assistantMessage || fallbackText;

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
    draftPrompt,
    promptSource: flow.shouldCreatePrompt ? "ai_assisted" : undefined,
    shouldCreatePrompt: flow.shouldCreatePrompt,
    isFinal: flow.isFinal,
    aiLog: {
      id: crypto.randomUUID(),
      provider: "gemini",
      purpose: flow.shouldCreatePrompt ? "draft_prompt" : "question_polish",
      stage: flow.nextStage,
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
    '{"blocked":false,"alertType":"off_topic","reason":"","assistantMessage":"학생에게 보여줄 응답","draftPrompt":"프롬프트 초안 또는 수정본. 없으면 빈 문자열"}'
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
