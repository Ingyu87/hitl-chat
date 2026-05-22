import type { ChatMessage, SessionConfig } from "@/lib/types";

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const meaningfulAnswers = answers.filter((answer) => !isWeakAnswer(answer));
  const answerText = meaningfulAnswers.length > 0 ? meaningfulAnswers.join(" / ") : "학생의 구체적인 답변이 아직 부족함";
  const required = config.requiredElements.length > 0 ? config.requiredElements.join(", ") : "없음";
  const constraints = config.constraints.length > 0 ? config.constraints.join(", ") : "없음";

  return [
    `[이미지 생성 프롬프트 초안]`,
    `주제: ${config.topic}`,
    `학생 아이디어: ${answerText}`,
    `반드시 포함할 요소: ${required}`,
    `피해야 할 요소: ${constraints}`,
    "",
    "위 내용을 바탕으로 이미지 생성 AI에 넣을 수 있는 하나의 프롬프트로 정리한다. 학생이 구체적으로 말하지 않은 핵심 아이디어는 새로 만들지 않는다."
  ].join("\n");
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  return [
    previousPrompt,
    "",
    `[학생 수정 요청]`,
    revisionRequest,
    "",
    "위 수정 요청을 반영해 이미지 생성 프롬프트를 다시 정리한다. 학생이 말하지 않은 핵심 아이디어는 새로 추가하지 않는다."
  ].join("\n");
}

function isWeakAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|아무생각없어|아무생각이없어|생각없어|대충|글쎄|잘모르겠어|잘모름|누구야|너누구야|응|네|ㅇㅇ|ㄴㄴ|\?+|!+)$/.test(
    normalized
  );
}
