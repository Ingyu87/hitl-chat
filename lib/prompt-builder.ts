import type { ChatMessage, SessionConfig } from "@/lib/types";

export const PROMPT_MAX_LENGTH = 400;

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = history
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .filter((answer) => !isWeakAnswer(answer));

  const answerText = answers.join(" / ");
  const details = inferVisualDetails(config, answerText);

  return limitPromptLength(
    [
      `${details.scene}`,
      `${details.subject}`,
      `${details.background}`,
      `${details.action}`,
      `${details.composition}`,
      `${details.style}`,
      `${details.exclusions}`
    ].join(" ")
  );
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  const cleanedPrevious = extractPromptOnly(previousPrompt);
  const cleanedRequest = revisionRequest.trim();
  if (!cleanedRequest) return limitPromptLength(cleanedPrevious);

  return limitPromptLength(`${cleanedPrevious} 수정 반영: ${cleanedRequest}.`);
}

export function extractPromptOnly(input: string) {
  const text = input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[.*\]$/.test(line))
    .filter((line) => !/^(주제|학생 아이디어|필수 요소|주의 요소|프롬프트|제외 요소|수정 요청)\s*:/.test(line))
    .join(" ");

  return text.replace(/\s+/g, " ").trim();
}

export function limitPromptLength(input: string, maxLength = PROMPT_MAX_LENGTH) {
  const normalized = extractPromptOnly(input);
  if (normalized.length <= maxLength) return normalized;

  const hardLimit = normalized.slice(0, maxLength).trim();
  const sentenceEnd = Math.max(hardLimit.lastIndexOf("."), hardLimit.lastIndexOf("요."), hardLimit.lastIndexOf("다."));
  if (sentenceEnd >= Math.floor(maxLength * 0.65)) return hardLimit.slice(0, sentenceEnd + 1).trim();

  const lastSpace = hardLimit.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.75)) return hardLimit.slice(0, lastSpace).trim();
  return hardLimit;
}

function inferVisualDetails(config: SessionConfig, answerText: string) {
  const topic = config.topic.trim() || "수업 주제";
  const outputType = config.outputType.trim() || "이미지 생성 프롬프트";
  const style = inferStyle(answerText);
  const mood = inferMood(answerText);
  const subject = inferSubject(topic, answerText);
  const background = inferBackground(topic, answerText);
  const action = inferAction(answerText);

  return {
    scene: `${topic}를 한눈에 이해할 수 있는 구체적인 한 장면.`,
    subject: `중심 피사체는 ${subject}.`,
    background: `배경은 ${background}.`,
    action: `${action}`,
    composition: `가로 화면, 중간 거리 시점, 중심 대상이 선명하고 배경에 원인과 결과가 함께 보이는 구도.`,
    style: `${style}, ${mood} 분위기, ${outputType}에 어울리는 선명한 디테일과 자연스러운 빛.`,
    exclusions: `글자, 워터마크, 선정적 요소, 혐오 표현은 제외.`
  };
}

function inferSubject(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/음식|파티|먹|초원|평화/.test(combined)) return "푸른 초원에서 맛있는 음식을 먹으며 평화로운 파티를 즐기는 사람들";
  if (/신재생|에너지|태양광|풍력|백인규/.test(combined)) return "신재생 에너지를 활용하는 사람들과 에너지 장치";
  if (/바다|생태|물고기|거북|플라스틱|해양/.test(combined)) return "바다 생물과 바다를 지키려는 사람들";
  if (/지구|미래|오염|쓰레기|환경|200년/.test(combined)) return "미래 지구에서 문제를 발견하고 해결하려는 사람들";
  if (/학교|교실|학생|안전/.test(combined)) return "학교 공간에서 안전하게 행동하는 학생들";
  return "학생이 말한 핵심 대상";
}

function inferBackground(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/초원|평화|파티/.test(combined)) return "넓은 푸른 초원, 밝은 하늘, 함께 나누는 음식이 있는 따뜻한 공간";
  if (/신재생|에너지|태양광|풍력/.test(combined)) return "태양광 패널, 풍력 발전기, 깨끗한 도시나 자연이 함께 보이는 공간";
  if (/바다|생태|해양/.test(combined)) return "맑은 바닷속과 오염 문제 또는 회복 변화가 함께 드러나는 해양 환경";
  if (/지구|미래|오염|환경|200년/.test(combined)) return "오염 흔적과 회복의 가능성이 함께 보이는 미래 지구 환경";
  if (/학교|교실|안전/.test(combined)) return "교실, 복도, 운동장처럼 수업 주제가 드러나는 학교 공간";
  return "수업 주제와 학생 답변이 구체적으로 드러나는 장소";
}

function inferAction(answerText: string) {
  if (/먹|음식|파티|즐기/.test(answerText)) return "사람들이 음식을 나누어 먹고 서로 웃으며 즐기는 순간.";
  if (/해결|치우|돕|구조|바꾸|회복/.test(answerText)) return "사람들이 문제를 발견하고 해결하려고 움직이는 순간.";
  if (/비교|전과후|현재|미래/.test(answerText.replace(/\s/g, ""))) return "화면 안에서 전과 후의 변화가 분명하게 비교되는 장면.";
  return "주제와 관련된 사람이 무엇을 하고 있는지 행동이 분명하게 보이는 순간.";
}

function inferStyle(answerText: string) {
  if (/픽셀|pixel/i.test(answerText)) return "픽셀아트 스타일";
  if (/수채화/.test(answerText)) return "부드러운 수채화 일러스트";
  if (/포스터/.test(answerText)) return "교육용 포스터 스타일";
  if (/만화|카툰/.test(answerText)) return "친근한 만화 일러스트";
  if (/사진|실사/.test(answerText)) return "현실적인 사진 스타일";
  return "선명한 디지털 일러스트";
}

function inferMood(answerText: string) {
  if (/평화|희망|밝|따뜻|회복/.test(answerText)) return "밝고 희망적인";
  if (/위험|오염|불편|어두|긴장/.test(answerText)) return "문제 상황이 분명하지만 해결 가능성이 보이는";
  if (/신나|역동|활기/.test(answerText)) return "활기차고 역동적인";
  return "주제가 분명하게 전달되는";
}

function isWeakAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|아무생각없어|생각없어|대충|글쎄|\?+|!+|ㅋ+|ㅎ+)$/.test(normalized);
}
