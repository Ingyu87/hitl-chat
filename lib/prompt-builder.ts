import type { ChatMessage, SessionConfig } from "@/lib/types";

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const required = config.requiredElements.length > 0 ? `반드시 포함할 요소: ${config.requiredElements.join(", ")}.` : "";
  const constraints = config.constraints.length > 0 ? `피해야 할 요소: ${config.constraints.join(", ")}.` : "";
  const answerText = answers.length > 0 ? answers.join(" / ") : "학생 답변이 아직 충분하지 않음";

  return [
    `${config.outputType}: ${config.topic}`,
    `학습 목표: ${config.learningGoal}`,
    required,
    `학생 아이디어: ${answerText}`,
    constraints,
    "학생이 말한 내용 안에서만 구체적이고 선명하게 표현한다. 학생이 말하지 않은 핵심 아이디어를 새로 추가하지 않는다."
  ]
    .filter(Boolean)
    .join("\n");
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  return [
    previousPrompt,
    "",
    `수정 요청: ${revisionRequest}`,
    "위 수정 요청을 반영하되, 학생이 말하지 않은 새 핵심 아이디어는 추가하지 않는다."
  ].join("\n");
}
