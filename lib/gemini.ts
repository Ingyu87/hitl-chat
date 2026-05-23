type GeminiOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  allowPartial?: boolean;
};

export class GeminiError extends Error {
  status?: number;
  finishReason?: string;
  details?: string;

  constructor(message: string, metadata?: { status?: number; finishReason?: string; details?: string }) {
    super(message);
    this.name = "GeminiError";
    this.status = metadata?.status;
    this.finishReason = metadata?.finishReason;
    this.details = metadata?.details;
  }
}

export async function callGeminiText(prompt: string, options?: GeminiOptions) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new GeminiError("missing_api_key");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options?.temperature ?? 0.4,
        maxOutputTokens: options?.maxOutputTokens ?? 900,
        responseMimeType: options?.responseMimeType,
        responseSchema: options?.responseSchema
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new GeminiError(`request_failed_${response.status}`, { status: response.status, details: details.slice(0, 500) });
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.[0]?.text?.trim();
  if (finishReason && !["STOP", "MAX_TOKENS"].includes(finishReason)) {
    throw new GeminiError(`stopped_${finishReason}`, { finishReason });
  }
  if (finishReason === "MAX_TOKENS") {
    if (options?.allowPartial && text) return text;
    throw new GeminiError("max_tokens", { finishReason });
  }

  if (!text) {
    throw new GeminiError("empty_text", { finishReason });
  }

  return text;
}

export async function callGeminiJson<T>(prompt: string, fallback: T, options?: Omit<GeminiOptions, "responseMimeType">): Promise<T> {
  const text = await callGeminiText(prompt, {
    ...options,
    responseMimeType: "application/json"
  });
  return parseJsonObject(text, fallback);
}

export function parseJsonObject<T>(text: string, fallback: T): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return fallback;
    }
  }
}
