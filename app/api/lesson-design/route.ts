import { callGeminiText } from "@/lib/gemini";
import { buildDefaultQuestionFlow, sanitizeQuestionFlow, STAGE_LABELS, STAGE_ORDER } from "@/lib/question-flow";
import type { SessionConfig, Stage } from "@/lib/types";

type LessonDesignBody = {
  config: SessionConfig;
  mode: "generate" | "refine";
};

type LessonDesignQuestion = {
  stage: Stage;
  label: string;
  question: string;
};

type LessonDesignResult = {
  questionFlow: LessonDesignQuestion[];
  requiredElements?: string[];
  constraints?: string[];
};

const lessonDesignSchema = {
  type: "OBJECT",
  properties: {
    requiredElements: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    constraints: {
      type: "ARRAY",
      items: { type: "STRING" }
    },
    questionFlow: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          stage: { type: "STRING", enum: STAGE_ORDER },
          label: { type: "STRING" },
          question: { type: "STRING" }
        },
        required: ["stage", "label", "question"]
      }
    }
  },
  required: ["requiredElements", "constraints", "questionFlow"]
};

export async function POST(request: Request) {
  const body = (await request.json()) as LessonDesignBody;
  const fallback = {
    questionFlow: body.mode === "refine" ? sanitizeQuestionFlow(body.config) : buildDefaultQuestionFlow(body.config),
    requiredElements: body.config.requiredElements,
    constraints: body.config.constraints
  };

  try {
    const prompt = buildLessonDesignPrompt(body);
    const text = await callGeminiText(prompt, {
      temperature: 0.65,
      maxOutputTokens: 2400,
      responseMimeType: "application/json",
      responseSchema: lessonDesignSchema
    });
    const parsed = parseLessonDesignJson(text);
    const questionFlow = normalizeQuestionFlow(parsed.questionFlow, body.config);

    if (isGenericDefaultFlow(questionFlow, body.config)) {
      throw new Error("AI가 기본 질문 템플릿과 거의 같은 결과를 반환했습니다. 주제에 맞춘 질문을 다시 생성해야 합니다.");
    }

    if (!hasTopicSpecificDesign(questionFlow, body.config)) {
      throw new Error("AI가 수업 주제의 구체적 맥락을 질문에 충분히 반영하지 못했습니다. 다시 시도해 주세요.");
    }

    return Response.json({
      questionFlow,
      requiredElements: normalizeList(parsed.requiredElements, body.config.requiredElements),
      constraints: normalizeList(parsed.constraints, body.config.constraints),
      aiUsed: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini lesson design failed";
    return Response.json(
      {
        error: message,
        aiUsed: false,
        ...fallback
      },
      { status: 500 }
    );
  }
}

function buildLessonDesignPrompt(body: LessonDesignBody) {
  const { config, mode } = body;
  const requiredElements = config.requiredElements.filter(Boolean).join(", ") || "none yet";
  const constraints = config.constraints.filter(Boolean).join(", ") || "none yet";
  const existingFlow =
    mode === "refine" && config.questionFlow.length > 0
      ? config.questionFlow.map((item, index) => `${index + 1}. ${item.stage}/${item.label}: ${item.question}`).join("\n")
      : "No previous flow. Create a new flow from the topic and lesson goal.";

  return [
    "You are designing a Korean chatbot conversation plan for students who will create an image-generation prompt.",
    "Think like a normal helpful chatbot: ask short, natural follow-up questions that respond to the topic and gradually help the student clarify their own idea.",
    "The teacher will review, edit, reorder, add, and finally approve your draft conversation flow before students receive the link.",
    "",
    "Your job is NOT to make a worksheet, survey, rubric, or generic 7-step template with only the topic name swapped in.",
    "Your job is to infer concrete contexts, places, people, objects, conflicts, emotions, visual details, and likely student ideas from the topic, then write a natural chatbot conversation path.",
    "",
    "Hard requirements:",
    "1. Return JSON only. No markdown.",
    "2. questionFlow must contain exactly these 7 stages in this order: orient, explore, concrete, describe, draft, revise, final.",
    "3. Write every label and question in Korean.",
    "4. Use the literal placeholder {{topic}} when the full topic title is needed. Do not write the topic title directly.",
    "5. Do not merely repeat the same default template. Each question must feel like a real chatbot turn for this exact topic.",
    "6. The questions should be conversational, friendly, and concise. Avoid teacher-facing language such as '학습 목표', '조건을 설명하라', '단계'.",
    "7. Guide the student toward their own answer. Do not write the student's final idea for them.",
    "8. The draft stage should naturally say that the chatbot will assemble a first prompt draft from the student's answers.",
    "9. The revise stage should ask what to add, remove, clarify, or change after seeing the draft.",
    "10. The final stage should ask for final approval/confirmation.",
    "",
    "Stage intent:",
    "- orient: Open the conversation naturally and ask what first comes to mind or what the student wants to show.",
    "- explore: Ask one topic-specific follow-up that expands possible scenes or situations.",
    "- concrete: Ask one follow-up that makes the idea specific enough for an image prompt.",
    "- describe: Ask one follow-up about mood, color, viewpoint, composition, style, or must-have visual details.",
    "- draft: Transition into making the first image prompt draft from prior answers.",
    "- revise: Ask for changes after the draft.",
    "- final: Confirm the final prompt.",
    "",
    `Mode: ${mode}`,
    `Topic: ${config.topic}`,
    `Learning goal: ${config.learningGoal}`,
    `Final output type: ${config.outputType}`,
    `Teacher required elements: ${requiredElements}`,
    `Teacher caution/constraint elements: ${constraints}`,
    "",
    "Existing flow for refine mode:",
    existingFlow,
    "",
    "Return shape:",
    '{"requiredElements":["..."],"constraints":["..."],"questionFlow":[{"stage":"orient","label":"...","question":"..."},{"stage":"explore","label":"...","question":"..."},{"stage":"concrete","label":"...","question":"..."},{"stage":"describe","label":"...","question":"..."},{"stage":"draft","label":"...","question":"..."},{"stage":"revise","label":"...","question":"..."},{"stage":"final","label":"...","question":"..."}]}'
  ].join("\n");
}

function normalizeQuestionFlow(questionFlow: LessonDesignQuestion[], config: SessionConfig) {
  const fallback = new Map(buildDefaultQuestionFlow(config).map((item) => [item.stage, item]));
  const incoming = new Map((questionFlow || []).map((item) => [item.stage, item]));

  const normalized = STAGE_ORDER.map((stage) => {
    const item = incoming.get(stage);
    const fallbackItem = fallback.get(stage)!;
    return {
      stage,
      label: item?.label?.trim() || STAGE_LABELS[stage],
      question: cleanQuestion(item?.question, config) || fallbackItem.question
    };
  });

  if (!normalized.some((item) => item.question.includes("{{topic}}"))) {
    normalized[0] = {
      ...normalized[0],
      question: `{{topic}}에 대해 이야기해볼게요. ${normalized[0].question}`
    };
  }

  return normalized;
}

function normalizeList(items: string[] | undefined, fallback: string[]) {
  const normalized = (items ?? []).map((item) => String(item).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.slice(0, 8) : fallback;
}

function cleanQuestion(question: string | undefined, config: SessionConfig) {
  const value = String(question ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.replaceAll(config.topic, "{{topic}}");
}

function parseLessonDesignJson(text: string): LessonDesignResult {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as LessonDesignResult;
  if (!Array.isArray(parsed.questionFlow) || parsed.questionFlow.length === 0) {
    throw new Error("AI가 질문 흐름 JSON을 반환하지 않았습니다.");
  }
  return parsed;
}

function isGenericDefaultFlow(questionFlow: LessonDesignQuestion[], config: SessionConfig) {
  const defaults = buildDefaultQuestionFlow(config).map((item) => normalizeComparable(item.question));
  const genericMatches = questionFlow.filter((item, index) => normalizeComparable(item.question) === defaults[index]).length;
  return genericMatches >= 3;
}

function hasTopicSpecificDesign(questionFlow: LessonDesignQuestion[], config: SessionConfig) {
  const text = questionFlow.map((item) => item.question.replace(/\{\{topic\}\}/g, "")).join(" ");
  const keywords = inferTopicKeywords(config.topic);
  const nonTopicSpecificWords = extractMeaningfulKoreanWords(text);
  const hasTopicKeyword = keywords.some((keyword) => text.includes(keyword));
  return hasTopicKeyword || nonTopicSpecificWords.length >= 10;
}

function normalizeComparable(value: string) {
  return value.replace(/\{\{topic\}\}/g, "").replace(/\s+/g, "").trim();
}

function inferTopicKeywords(topic: string) {
  const keywords = extractMeaningfulKoreanWords(topic).filter((item) => !["상상속", "상상", "활용", "생성형"].includes(item));

  if (/동네|마을|지역|도시|우리/.test(topic)) {
    keywords.push("동네", "마을", "골목", "공원", "주민", "가게", "놀이터", "생활", "공간", "이웃");
  }
  if (/기후|환경|위기|지구|생태|탄소/.test(topic)) {
    keywords.push("기후", "환경", "지구", "탄소", "에너지", "생태", "재활용");
  }
  if (/AI|인공지능|생성형|디지털|프롬프트/.test(topic)) {
    keywords.push("AI", "인공지능", "디지털", "프롬프트", "도구", "윤리");
  }

  return Array.from(new Set(keywords));
}

function extractMeaningfulKoreanWords(value: string) {
  return value
    .split(/[\s,./|"'“”‘’!?()[\]{}:;<>]+/)
    .map((item) => item.trim())
    .filter((item) => /[가-힣A-Za-z]/.test(item) && item.length >= 2);
}
