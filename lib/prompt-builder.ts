import type { ChatMessage, SessionConfig } from "@/lib/types";

export const PROMPT_MAX_LENGTH = 400;

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const meaningfulAnswers = answers.filter((answer) => !isWeakAnswer(answer));
  const answerText = meaningfulAnswers.length > 0 ? meaningfulAnswers.join(" / ") : "학생의 구체적인 답변이 아직 부족함";
  const visualDetails = inferVisualDetails(config, answerText);

  return limitPromptLength(
    `${visualDetails.scene}. ${visualDetails.subject}. ${visualDetails.environment}. ${visualDetails.action}. ${visualDetails.composition}. ${visualDetails.lighting}. ${visualDetails.style}. ${visualDetails.quality}.`
  );
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  const cleanedPrevious = extractPromptOnly(previousPrompt);
  const cleanedRequest = revisionRequest.trim();
  if (!cleanedRequest) return limitPromptLength(cleanedPrevious);

  return limitPromptLength(`${cleanedPrevious} 수정 요청 반영: ${cleanedRequest}.`);
}

export function extractPromptOnly(input: string) {
  const text = input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[.*\]$/.test(line))
    .filter((line) => !/^(주제|학생 아이디어 근거|반드시 포함할 요소|피하거나 주의할 요소|프롬프트|제외\/주의|학생 수정 요청)\s*:/.test(line))
    .join(" ");

  return text.replace(/\s+/g, " ").trim();
}

export function limitPromptLength(input: string, maxLength = PROMPT_MAX_LENGTH) {
  const normalized = extractPromptOnly(input);
  if (normalized.length <= maxLength) return normalized;

  const hardLimit = normalized.slice(0, maxLength).trim();
  const sentenceEnd = Math.max(hardLimit.lastIndexOf("."), hardLimit.lastIndexOf("다."), hardLimit.lastIndexOf("요."));
  if (sentenceEnd >= Math.floor(maxLength * 0.65)) return hardLimit.slice(0, sentenceEnd + 1).trim();

  const lastSpace = hardLimit.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.75)) return hardLimit.slice(0, lastSpace).trim();
  return hardLimit;
}

function inferVisualDetails(config: SessionConfig, answerText: string) {
  const topic = config.topic.trim() || "수업 주제";
  const outputType = config.outputType.trim() || "이미지 생성 프롬프트";
  const style = inferStyle(answerText);
  const setting = inferSetting(topic, answerText);
  const mood = inferMood(answerText);

  return {
    scene: `${topic}를 한눈에 이해할 수 있는 구체적인 한 장면`,
    subject: `중심 피사체는 ${setting.mainSubject}이고, 학생 답변에서 나온 핵심 요소가 화면의 주요 대상으로 보인다`,
    environment: `배경은 ${setting.environment}이며, 문제 상황과 변화가 주변 사물과 표정으로 드러난다`,
    action: "사람들이 문제를 발견하거나 해결하려고 움직이는 순간을 담고, 행동의 방향과 목적이 분명하게 보인다",
    composition: "가로형 화면, 중간 거리 시점, 중심 피사체를 전경에 크게 배치하고 배경에는 원인과 결과가 함께 보이게 구성한다",
    lighting: `${mood} 분위기의 자연광과 사실적인 그림자를 사용한다`,
    style: `${style}, ${outputType}에 어울리는 선명한 디테일`,
    quality: "highly detailed, coherent visual storytelling, clear focal point, no text, no watermark"
  };
}

function inferSetting(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/지구|미래|오염|쓰레기|환경|생존|위험|200년/.test(combined)) {
    return {
      mainSubject: "오염된 미래 지구에서 문제를 발견하고 해결하려는 사람들",
      environment: "쓰레기와 오염 흔적이 남아 있지만 사람들이 복구를 시작한 도시와 자연이 만나는 공간"
    };
  }
  if (/바다|물고기|플라스틱|해양|산호|거북/.test(combined)) {
    return {
      mainSubject: "오염된 바다와 그 안에서 영향을 받는 생물 또는 사람들",
      environment: "수면 위와 바닷속 풍경이 함께 보이는 해양 환경"
    };
  }
  if (/학교|교실|학생|안전|운동장/.test(combined)) {
    return {
      mainSubject: "학교 공간에서 문제를 발견하거나 해결하는 학생들",
      environment: "교실, 복도, 운동장처럼 수업 주제가 드러나는 학교 공간"
    };
  }
  return {
    mainSubject: "학생이 말한 핵심 대상",
    environment: "수업 주제와 학생 답변이 드러나는 구체적인 장소"
  };
}

function inferStyle(answerText: string) {
  if (/수채|수채화/.test(answerText)) return "watercolor illustration";
  if (/포스터/.test(answerText)) return "educational poster style";
  if (/만화|카툰/.test(answerText)) return "friendly cartoon illustration";
  if (/픽셀/.test(answerText)) return "pixel art style";
  return "realistic documentary photo style";
}

function inferMood(answerText: string) {
  if (/밝|희망|깨끗|복구|움직/.test(answerText)) return "위험하지만 희망이 남아 있는";
  if (/위험|불편|오염|쓰레기|문제/.test(answerText)) return "불안하고 긴장감 있는";
  return "주제가 분명하게 전달되는";
}

function isWeakAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|아무생각없어|대충|글쎄|\?+|!+|ㅋ+|ㅎ+)$/.test(normalized);
}
