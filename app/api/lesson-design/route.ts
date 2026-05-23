import { callAiJson } from "@/lib/ai-provider";
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
    requiredElements: { type: "ARRAY", items: { type: "STRING" } },
    constraints: { type: "ARRAY", items: { type: "STRING" } },
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
    const parsed = await callAiJson<LessonDesignResult | null>(buildLessonDesignPrompt(body), null, {
      temperature: 0.6,
      maxOutputTokens: Math.min(4096, Math.max(1800, (body.config.questionFlow.length || STAGE_ORDER.length) * 220)),
      responseSchema: lessonDesignSchema
    });

    if (!parsed || !Array.isArray(parsed.questionFlow) || parsed.questionFlow.length === 0) {
      throw new Error("lesson_design_invalid_json");
    }

    return Response.json({
      questionFlow: normalizeQuestionFlow(parsed.questionFlow, body.config),
      requiredElements: normalizeList(parsed.requiredElements, body.config.requiredElements),
      constraints: normalizeList(parsed.constraints, body.config.constraints),
      aiUsed: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "lesson_design_failed";
    return Response.json({
      error: message,
      aiUsed: false,
      ...fallback
    });
  }
}

function buildLessonDesignPrompt(body: LessonDesignBody) {
  const { config, mode } = body;
  const requiredElements = config.requiredElements.filter(Boolean).join(", ") || "none yet";
  const constraints = config.constraints.filter(Boolean).join(", ") || "none yet";
  const targetQuestionCount = Math.min(10, Math.max(config.questionFlow.length || STAGE_ORDER.length, STAGE_ORDER.length));
  const existingFlow =
    mode === "refine" && config.questionFlow.length > 0
      ? config.questionFlow.map((item, index) => `${index + 1}. ${item.stage}/${item.label}: ${item.question}`).join("\n")
      : "No previous flow. Create a new flow from the topic and lesson goal.";

  return [
    "You design a Korean chatbot conversation guide for elementary students creating an image-generation prompt.",
    "Return JSON only. No markdown.",
    "Every question, label, choice label, choice value, and choice description must be written in Korean.",
    `Create ${targetQuestionCount} or fewer questionFlow items. Never exceed ${MAX_QUESTION_COUNT}.`,
    "Each item must be a short, complete Korean student-facing checkpoint.",
    "The flow should gather visual details: scene, subject, background, action, composition, mood, style, and exclusions.",
    'Never output the literal string "{{topic}}"; use the actual lesson topic naturally when needed.',
    "Choices are optional but helpful. Use simple Korean labels and values that fit the lesson topic, not generic fixed labels.",
    "Keep draft, revise, and final checkpoints when useful.",
    "Use stable stage ids: orient, explore, concrete, describe, draft, revise, final, or question-1.",
    "",
    `Mode: ${mode}`,
    `Topic: ${config.topic}`,
    `Learning goal: ${config.learningGoal}`,
    `Final output type: ${config.outputType}`,
    `Teacher required elements: ${requiredElements}`,
    `Teacher caution/constraint elements: ${constraints}`,
    "",
    "Existing flow:",
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
