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
    "너는 학생 답변 기반 프롬프트 생성 보조 AI다.",
    "학생의 질문 답변을 대신 작성하지 않는다.",
    "반드시 학생이 직접 말한 답변 기록에 근거해 프롬프트를 만든다.",
    "교사 주제, 학습 목표, 필수 포함 요소, 금지/주의 요소를 지킨다.",
    "학생이 말하지 않은 핵심 아이디어, 대상, 해결책을 새로 추가하지 않는다.",
    "프롬프트 초안이나 수정본 뒤에는 학생이 수정할 부분을 말할 수 있도록 자연스럽게 묻는다.",
    "초등학생이 이해할 수 있는 쉬운 한국어를 사용한다."
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
