import type { AiPurpose, ChatMessage, SessionConfig, Stage } from "@/lib/types";

export async function callGemini(args: {
  config: SessionConfig;
  purpose: AiPurpose;
  stage: Stage;
  baseText: string;
  history: ChatMessage[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const instruction = [
    "너는 초등학생을 돕는 HITL 프롬프트 빌더 보조 AI다.",
    "학생의 생각을 대신 만들지 않는다.",
    "교사 주제, 학습 목표, 필수 포함 요소, 금지/주의 요소를 지킨다.",
    "한 번에 하나의 질문만 만든다.",
    "초등학생이 이해할 수 있는 쉬운 한국어를 사용한다.",
    "규칙 기반 단계와 다음 목표를 바꾸지 않는다.",
    "프롬프트 개선 시 학생이 말하지 않은 핵심 내용을 새로 추가하지 않는다."
  ].join("\n");

  const prompt = [
    instruction,
    "",
    `수업 주제: ${args.config.topic}`,
    `학습 목표: ${args.config.learningGoal}`,
    `산출물 유형: ${args.config.outputType}`,
    `필수 포함 요소: ${args.config.requiredElements.join(", ") || "없음"}`,
    `금지/주의 요소: ${args.config.constraints.join(", ") || "없음"}`,
    `현재 단계: ${args.stage}`,
    `목적: ${args.purpose}`,
    "",
    "학생 답변 기록:",
    args.history
      .filter((message) => message.role === "user")
      .map((message) => `- ${message.content}`)
      .join("\n") || "- 아직 없음",
    "",
    "다듬을 원문:",
    args.baseText,
    "",
    "결과만 한국어로 출력해."
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new Error("Gemini returned empty text");
  }

  return text;
}
