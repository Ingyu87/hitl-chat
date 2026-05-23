import { callGeminiJson, callGeminiText, parseJsonObject } from "@/lib/gemini";

export type AiProvider = "gemini" | "upstage";

type AiCallOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  allowPartial?: boolean;
};

export function getAiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.toLowerCase() === "upstage" ? "upstage" : "gemini";
}

export function hasAiApiKey(provider = getAiProvider()) {
  if (provider === "upstage") return Boolean(process.env.UPSTAGE_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY);
}

export async function callAiText(prompt: string, options?: AiCallOptions) {
  const provider = getAiProvider();
  if (provider === "upstage") return callUpstageText(prompt, options);
  return callGeminiText(prompt, options);
}

export async function callAiJson<T>(prompt: string, fallback: T, options?: AiCallOptions): Promise<T> {
  const provider = getAiProvider();
  if (provider === "upstage") {
    const text = await callUpstageText(prompt, {
      ...options,
      responseMimeType: "application/json"
    });
    return parseJsonObject(text, fallback);
  }
  return callGeminiJson(prompt, fallback, options);
}

async function callUpstageText(prompt: string, options?: AiCallOptions) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("missing_api_key");

  const model = process.env.UPSTAGE_MODEL || "solar-mini";
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: options?.temperature ?? 0.4,
    max_tokens: options?.maxOutputTokens ?? 900,
    stream: false
  };

  if (options?.responseMimeType === "application/json") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.upstage.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`request_failed_${response.status}${details ? `:${details.slice(0, 200)}` : ""}`);
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  const text = choice?.message?.content?.trim() ?? "";
  if (choice?.finish_reason === "length") {
    if (options?.allowPartial && text) return text;
    throw new Error("max_tokens");
  }
  if (!text) throw new Error("empty_text");
  return text;
}
