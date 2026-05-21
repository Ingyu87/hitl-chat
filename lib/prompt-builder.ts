import type { ChatMessage, SessionConfig } from "@/lib/types";

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const answerText = answers.length > 0 ? answers.join(" / ") : "학생 답변을 바탕으로 구체화";
  const required = config.requiredElements.length > 0 ? `필수 포함 요소: ${config.requiredElements.join(", ")}.` : "";
  const constraints = config.constraints.length > 0 ? `주의할 점: ${config.constraints.join(", ")}.` : "";

  return [
    `${config.outputType}를 작성한다.`,
    `수업 주제: ${config.topic}.`,
    `학습 목표: ${config.learningGoal}.`,
    required,
    `학생 아이디어: ${answerText}.`,
    constraints,
    "학생이 직접 말한 아이디어를 중심으로 장면, 대상, 분위기, 조건이 분명하게 드러나도록 작성한다."
  ]
    .filter(Boolean)
    .join("\n");
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  return [
    previousPrompt,
    "",
    `수정 요청 반영: ${revisionRequest}`,
    "위 수정 요청을 반영하되, 학생이 말하지 않은 핵심 아이디어는 새로 추가하지 않는다."
  ].join("\n");
}
