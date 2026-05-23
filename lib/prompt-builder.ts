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
  const visualDetails = inferVisualDetails(config, answerText);

  return [
    "[이미지 생성 프롬프트 초안]",
    `주제: ${config.topic}`,
    `학생 아이디어 근거: ${answerText}`,
    `반드시 포함할 요소: ${required}`,
    `피하거나 주의할 요소: ${constraints}`,
    "",
    "프롬프트:",
    `${visualDetails.scene}. ${visualDetails.subject}. ${visualDetails.environment}. ${visualDetails.action}. ${visualDetails.composition}. ${visualDetails.lighting}. ${visualDetails.style}. ${visualDetails.quality}.`,
    "",
    `제외/주의: ${constraints}. 학생이 말하지 않은 핵심 아이디어는 새로 추가하지 말고, 위 학생 아이디어와 수업 조건 안에서만 시각적으로 구체화한다.`
  ].join("\n");
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  return [
    previousPrompt,
    "",
    "[학생 수정 요청]",
    revisionRequest,
    "",
    "위 수정 요청을 반영해 이미지 생성 프롬프트를 다시 정리한다. 장면, 피사체, 배경, 행동, 구도, 조명, 스타일, 품질 표현을 유지하되 학생이 말하지 않은 핵심 아이디어는 새로 추가하지 않는다."
  ].join("\n");
}

function inferVisualDetails(config: SessionConfig, answerText: string) {
  const topic = config.topic.trim() || "수업 주제";
  const outputType = config.outputType.trim() || "이미지 생성 프롬프트";
  const style = inferStyle(answerText);
  const setting = inferSetting(topic, answerText);
  const mood = inferMood(answerText);

  return {
    scene: `${topic}을 한눈에 이해할 수 있는 구체적인 한 장면`,
    subject: `중심 피사체는 ${setting.mainSubject}이며, 학생 답변에서 나온 핵심 요소가 화면의 주요 대상으로 보이게 한다`,
    environment: `배경은 ${setting.environment}이고, 문제 상황과 변화가 주변 사물, 표정, 거리감으로 드러난다`,
    action: "사람들이 문제를 발견하거나 해결하려고 움직이는 순간을 담고, 행동의 방향과 목적이 분명하게 보이게 한다",
    composition: "가로형 화면, 중간 거리 시점, 중심 피사체는 전경에 크게 배치하고 배경에는 원인과 결과가 함께 보이도록 깊이감 있게 구성한다",
    lighting: `${mood} 분위기, 자연광과 사실적인 그림자를 사용해 장면의 긴장감과 현실감을 살린다`,
    style: `${style}, ${outputType}에 적합한 선명한 디테일`,
    quality: "highly detailed, coherent visual storytelling, realistic textures, clear focal point, no text, no watermark"
  };
}

function inferSetting(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/지구|미래|오염|쓰레기|환경|생존|위험/.test(combined)) {
    return {
      mainSubject: "오염된 미래 지구에서 문제를 발견하고 해결하려는 사람들",
      environment: "쓰레기와 오염 흔적이 남아 있지만 사람들이 복구를 시작한 도시와 자연이 만나는 공간"
    };
  }
  if (/바다|물고기|플라스틱|해양/.test(combined)) {
    return {
      mainSubject: "오염된 바다와 그 안에서 영향을 받는 생물 또는 사람들",
      environment: "해변, 바다, 수면 아래 장면이 함께 느껴지는 환경"
    };
  }
  if (/학교|교실|학생/.test(combined)) {
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
  if (/밝|희망|해결|복구|움직/.test(answerText)) return "위험하지만 희망이 남아 있는";
  if (/위험|불편|오염|쓰레기|문제/.test(answerText)) return "불안하고 긴장감 있는";
  return "주제가 분명하게 전달되는";
}

function isWeakAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|아무생각없어|아무생각이없어|대충|글쎄|\?+|!+)$/.test(normalized);
}
