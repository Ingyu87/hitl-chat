import { callAiText, hasAiApiKey } from "@/lib/ai-provider";
import { limitPromptLength } from "@/lib/prompt-builder";
import type { AiAssistResult, AiPurpose, ChatMessage, SessionConfig, Stage } from "@/lib/types";

export async function maybeAssistWithAi(args: {
  config: SessionConfig;
  stage: Stage;
  purpose?: AiPurpose;
  baseText: string;
  history: ChatMessage[];
  aiCallCount: number;
}): Promise<AiAssistResult> {
  if (!args.purpose) return { text: args.baseText, used: false, fallbackReason: "no_ai_purpose" };
  if (!args.config.aiEnabled) return { text: args.baseText, used: false, fallbackReason: "ai_disabled" };
  if (!hasAiApiKey()) return { text: args.baseText, used: false, fallbackReason: "missing_api_key" };

  const remainingCalls = args.config.aiCallsPerStudentLimit - args.aiCallCount;
  if (remainingCalls <= 0) return { text: args.baseText, used: false, fallbackReason: "limit_exceeded" };

  if (args.purpose === "question_polish" && remainingCalls <= 2) {
    return { text: args.baseText, used: false, fallbackReason: "reserved_for_prompt_generation" };
  }

  try {
    const text = await callAiText(buildAssistPrompt(args), {
      temperature: args.purpose === "question_polish" ? 0.55 : 0.3,
      maxOutputTokens: args.purpose === "question_polish" ? 1024 : 2048,
      allowPartial: true
    });

    const trimmed = text.trim();
    if (args.purpose === "question_polish" && !isCompleteStudentQuestion(trimmed)) {
      return { text: args.baseText, used: false, fallbackReason: "incomplete_question" };
    }

    const resultText = args.purpose === "question_polish" ? trimmed : limitPromptLength(trimmed);
    if (args.purpose !== "question_polish" && !isDetailedImagePrompt(resultText)) {
      return { text: args.baseText, used: false, fallbackReason: "insufficient_visual_detail" };
    }

    return { text: resultText, used: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_error";
    return { text: args.baseText, used: false, fallbackReason: message };
  }
}

function buildAssistPrompt(args: {
  config: SessionConfig;
  stage: Stage;
  purpose?: AiPurpose;
  baseText: string;
  history: ChatMessage[];
}) {
  const recent = args.history
    .slice(-12)
    .map((message) => `${message.role}(${message.stage}): ${message.content}`)
    .join("\n");
  const latestStudent = [...args.history].reverse().find((message) => message.role === "user")?.content ?? "";

  if (args.purpose === "question_polish") {
    return [
      "You are a Korean elementary classroom chatbot.",
      "Rewrite the teacher-approved next question so it sounds natural and responds to the student's latest answer.",
      "Return exactly one Korean student-facing chatbot message.",
      "Do not add new core ideas for the student. Do not generate the final image prompt here.",
      "The message must be short, warm, complete, and end with a question or clear choice instruction.",
      "",
      `Lesson topic: ${args.config.topic}`,
      `Learning goal: ${args.config.learningGoal}`,
      `Current stage: ${args.stage}`,
      `Required elements: ${args.config.requiredElements.join(", ") || "none"}`,
      `Constraints: ${args.config.constraints.join(", ") || "none"}`,
      "",
      "Recent conversation:",
      recent || "none",
      "",
      `Latest student answer: ${latestStudent}`,
      "",
      "Teacher-approved purpose/question:",
      args.baseText
    ].join("\n");
  }

  return [
    "You are a Korean image-prompt writing assistant for a classroom activity.",
    "Create a detailed image-generation prompt from ONLY the student's conversation and the teacher settings.",
    "Return the final prompt text only. No markdown, no explanation.",
    "The final prompt must be 400 Korean characters or fewer.",
    "Do not include labels such as topic, student idea, prompt, required elements, or cautions.",
    "Do not invent a new core idea that the student did not provide.",
    "Do expand visual implementation details that are necessary for an image model: scene, main subject, background, action, composition, lighting, mood, style, texture, quality, and exclusions.",
    "The output must be at least 5 complete Korean sentences or sentence-like prompt clauses.",
    "Avoid unsafe, sexual, abusive, or off-topic content even if a student requested it.",
    "",
    `Lesson topic: ${args.config.topic}`,
    `Learning goal: ${args.config.learningGoal}`,
    `Output type: ${args.config.outputType}`,
    `Required elements: ${args.config.requiredElements.join(", ") || "none"}`,
    `Constraints: ${args.config.constraints.join(", ") || "none"}`,
    "",
    "Recent conversation:",
    recent || "none",
    "",
    "Rule-based draft to preserve and improve:",
    args.baseText
  ].join("\n");
}

function isCompleteStudentQuestion(text: string) {
  const value = text.trim();
  if (value.length < 12) return false;
  if (/^(student|teacher|chatbot|assistant)\s*:/i.test(value)) return false;
  if (/(작성한다|출력한다|분석한다|안내한다)$/.test(value)) return false;
  return /[?？!！]$|말해\s*주세요[.!！]?|골라.*[주좋]|해\s*볼까요|어때요|이야기해|알려\s*주세요|생각해\s*주세요|선택해\s*주세요/.test(value);
}

function isDetailedImagePrompt(text: string) {
  const value = text.trim();
  if (value.length < 160) return false;
  const requiredSignals = [
    /장면|scene|상황/,
    /중심|피사체|대상|subject/,
    /배경|장소|background/,
    /구도|시점|composition|view/,
    /조명|빛|lighting|분위기/,
    /스타일|style|사진|일러스트|텍스처/
  ];
  return requiredSignals.filter((pattern) => pattern.test(value)).length >= 4;
}
