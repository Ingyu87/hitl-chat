import { callGeminiText } from "@/lib/gemini";
import { buildDefaultQuestionFlow, MAX_QUESTION_COUNT, normalizeChoices, sanitizeQuestionFlow, STAGE_LABELS, STAGE_ORDER } from "@/lib/question-flow";
import type { LessonQuestion, QuestionChoice, SessionConfig, Stage } from "@/lib/types";

type LessonDesignBody = {
  config: SessionConfig;
  mode: "generate" | "refine";
};

type LessonDesignQuestion = {
  stage?: string;
  label?: string;
  question?: string;
  choices?: QuestionChoice[];
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
          stage: { type: "STRING" },
          label: { type: "STRING" },
          question: { type: "STRING" },
          choices: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                value: { type: "STRING" },
                description: { type: "STRING" }
              },
              required: ["label", "value"]
            }
          }
        },
        required: ["label", "question"]
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
      maxOutputTokens: Math.min(8192, Math.max(2400, (body.config.questionFlow.length || 8) * 260)),
      responseMimeType: "application/json",
      responseSchema: lessonDesignSchema
    });
    const parsed = parseLessonDesignJson(text);
    const questionFlow = normalizeQuestionFlow(parsed.questionFlow, body.config);

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
  const targetQuestionCount = Math.min(MAX_QUESTION_COUNT, Math.max(config.questionFlow.length || 8, STAGE_ORDER.length));
  const existingFlow =
    mode === "refine" && config.questionFlow.length > 0
      ? config.questionFlow.map((item, index) => `${index + 1}. ${item.stage}/${item.label}: ${item.question}`).join("\n")
      : "No previous flow. Create a new flow from the topic and lesson goal.";

  return [
    "You are designing a Korean chatbot conversation guide for students who will create an image-generation prompt.",
    "Return JSON only. No markdown.",
    `Create up to ${targetQuestionCount} questions. Never return more than ${MAX_QUESTION_COUNT} questionFlow items.`,
    "Limit by question count, not by token count: each questionFlow array item is one student-facing checkpoint.",
    "Use short complete Korean sentences. Do not output unfinished questions.",
    "Do not expose {{topic}} to the teacher or student. Use the actual topic naturally when needed.",
    "Every question may include choices. Choices help students answer without writing a long essay.",
    "For art style choices, include easy descriptions such as watercolor, poster, cartoon, realistic photo, pixel art.",
    "Keep the final three functional checkpoints if useful: draft, revise, final.",
    "Use stable stage ids. For extra custom questions use question-1, question-2, etc.",
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
    '{"requiredElements":["..."],"constraints":["..."],"questionFlow":[{"stage":"orient","label":"...","question":"...","choices":[{"label":"...","value":"...","description":"..."}]}]}'
  ].join("\n");
}

function normalizeQuestionFlow(questionFlow: LessonDesignQuestion[], config: SessionConfig): LessonQuestion[] {
  const fallback = buildDefaultQuestionFlow(config);
  const incoming = Array.isArray(questionFlow) && questionFlow.length > 0 ? questionFlow : fallback;
  const seen = new Set<string>();

  return incoming.slice(0, MAX_QUESTION_COUNT).map((item, index) => {
    const fallbackItem = fallback[index] ?? fallback[fallback.length - 1];
    const fallbackStage = fallbackItem?.stage ?? `question-${index + 1}`;
    let stage = cleanStage(item.stage || fallbackStage, index);
    if (seen.has(stage)) stage = `${stage}-${index + 1}`;
    seen.add(stage);

    return {
      stage,
      label: String(item.label || STAGE_LABELS[stage] || fallbackItem?.label || `질문 ${index + 1}`).trim(),
      question: cleanQuestion(item.question, config) || fallbackItem?.question || "다음 생각을 말해 주세요.",
      choices: normalizeChoices(item.choices && item.choices.length > 0 ? item.choices : fallbackItem?.choices)
    };
  });
}

function cleanStage(stage: string, index: number): Stage {
  const value = String(stage || "").trim().toLowerCase();
  if (!value) return `question-${index + 1}`;
  return value.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || `question-${index + 1}`;
}

function normalizeList(items: string[] | undefined, fallback: string[]) {
  const normalized = (items ?? []).map((item) => String(item).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.slice(0, 8) : fallback;
}

function cleanQuestion(question: string | undefined, config: SessionConfig) {
  const value = String(question ?? "").replace(/\{\{topic\}\}/g, config.topic).replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.replaceAll("{{topic}}", config.topic);
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
