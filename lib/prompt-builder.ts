import type { ChatMessage, SessionConfig } from "@/lib/types";

export const PROMPT_MAX_LENGTH = 400;

const META_LABEL_PATTERN = /^(주제|학생\s*아이디어|필수\s*요소|주의\s*요소|금지\s*요소|프롬프트|제외\s*요소|수정\s*(요청|의견|반영)|revision|request|prompt)\s*[:：]/i;
const FINAL_APPROVAL_PATTERN = /(이대로\s*확정|최종\s*확정|확정|좋아|괜찮아|완성|ok|yes)/i;
const PROMPT_REQUEST_PATTERN = /(프롬프트|결과|만들어|작성|보여|알려|완성)/i;

export function buildDraftPrompt(config: SessionConfig, history: ChatMessage[]) {
  const answers = getStudentAnswers(history);
  const answerText = answers.join(" ");
  const details = inferVisualDetails(config, answerText);

  return limitPromptLength(
    [
      details.scene,
      details.subject,
      details.background,
      details.action,
      details.composition,
      details.style,
      details.exclusions
    ].join(" ")
  );
}

export function revisePrompt(previousPrompt: string, revisionRequest: string) {
  const cleanedPrevious = extractPromptOnly(previousPrompt);
  const cleanedRequest = cleanStudentAnswer(revisionRequest);
  if (!cleanedRequest || isWeakAnswer(cleanedRequest)) return limitPromptLength(cleanedPrevious);

  return limitPromptLength(integrateRevision(cleanedPrevious, cleanedRequest));
}

export function extractPromptOnly(input: string) {
  return input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[.*\]$/.test(line))
    .filter((line) => !META_LABEL_PATTERN.test(line))
    .join(" ")
    .replace(/\b(수정\s*(요청|의견|반영)|revision|request)\s*[:：]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function limitPromptLength(input: string, maxLength = PROMPT_MAX_LENGTH) {
  const normalized = extractPromptOnly(input);
  if (normalized.length <= maxLength) return normalized;

  const hardLimit = normalized.slice(0, maxLength).trim();
  const sentenceEnd = Math.max(hardLimit.lastIndexOf("."), hardLimit.lastIndexOf("!"), hardLimit.lastIndexOf("?"), hardLimit.lastIndexOf("다."));
  if (sentenceEnd >= Math.floor(maxLength * 0.65)) return hardLimit.slice(0, sentenceEnd + 1).trim();

  const lastSpace = hardLimit.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.75)) return hardLimit.slice(0, lastSpace).trim();
  return hardLimit;
}

function getStudentAnswers(history: ChatMessage[]) {
  return history
    .filter((message) => message.role === "user")
    .map((message) => cleanStudentAnswer(message.content))
    .filter(Boolean)
    .filter((answer) => !isWeakAnswer(answer))
    .filter((answer) => !FINAL_APPROVAL_PATTERN.test(answer.replace(/\s/g, "")))
    .filter((answer) => !isBarePromptRequest(answer));
}

function cleanStudentAnswer(input: string) {
  return extractPromptOnly(input)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function integrateRevision(previousPrompt: string, revisionRequest: string) {
  const request = sentenceFromRequest(revisionRequest);
  if (!request) return previousPrompt;

  const base = previousPrompt.replace(/\s*제외\s*[:：].*$/i, "").trim();
  const exclusions = extractExclusions(previousPrompt);
  return [base, request, exclusions].filter(Boolean).join(" ");
}

function sentenceFromRequest(request: string) {
  const normalized = request
    .replace(/^(수정\s*(요청|의견|반영)\s*[:：]\s*)/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (/[.!?]$/.test(normalized) && !/(해줘|해주세요|좋겠어|좋겠어요)[.!?]?$/.test(normalized)) return normalized;

  const value = normalized
    .replace(/(도\s*)?있으면\s*좋겠(어|어요)\s*\.?$/i, "도 함께 보인다")
    .replace(/(이|가)\s*더\s*잘\s*보이게\s*(해줘|해주세요)?\s*\.?$/i, "$1 선명하게 보인다")
    .replace(/더\s*잘\s*보이게\s*(해줘|해주세요)?\s*\.?$/i, "선명하게 보인다")
    .replace(/(이|가)?\s*보이게\s*(해줘|해주세요)\s*\.?$/i, "$1 보인다")
    .replace(/\s*(을|를)?\s*(넣어줘|넣어주세요|추가해줘|추가해주세요)\s*\.?$/i, "이 포함된다")
    .replace(/(보이게 해줘|보이게 해주세요|바꿔줘|바꿔주세요|수정해줘|수정해주세요|해줘|해주세요)\s*\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) return "";
  if (/[.!?]$/.test(value)) return value;
  if (/(보인다|드러난다|포함된다|표현된다|나타난다)$/.test(value)) return `${value}.`;
  return `${value}가 장면에 자연스럽게 드러난다.`;
}

function extractExclusions(prompt: string) {
  const match = prompt.match(/(글자|워터마크|선정적|혐오|폭력|개인정보|제외)[^.?!]*(?:[.?!]|$)/gi);
  if (!match?.length) return "글자, 워터마크, 개인정보 노출, 선정적 요소, 혐오 표현은 제외한다.";
  return match.join(" ").trim();
}

function inferVisualDetails(config: SessionConfig, answerText: string) {
  const topic = config.topic.trim() || "수업 주제";
  const outputType = config.outputType.trim() || "이미지 생성 프롬프트";
  const style = inferStyle(answerText);
  const mood = inferMood(answerText);
  const subject = inferSubject(topic, answerText);
  const background = inferBackground(topic, answerText);
  const action = inferAction(answerText);
  const requiredElements = config.requiredElements.length > 0 ? `필수 요소인 ${config.requiredElements.join(", ")}가 자연스럽게 보인다.` : "";
  const constraints = config.constraints.length > 0 ? `${config.constraints.join(", ")}는 제외한다.` : "글자, 워터마크, 개인정보 노출, 선정적 요소, 혐오 표현은 제외한다.";

  return {
    scene: `${topic}를 한눈에 이해할 수 있는 구체적인 장면.`,
    subject: `중심 피사체는 ${subject}.`,
    background: `배경은 ${background}.`,
    action,
    composition: "가로 화면, 중간 거리 시점, 중심 대상과 배경의 관계가 함께 보이는 안정적인 구도.",
    style: `${style}, ${mood} 분위기, ${outputType}에 어울리는 선명한 디테일과 자연스러운 빛.`,
    exclusions: `${requiredElements} ${constraints}`.trim()
  };
}

function inferSubject(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/신재생|재생\s*에너지|태양광|풍력|에너지/.test(combined)) return "신재생 에너지를 활용하는 사람들과 태양광 패널, 풍력 발전기 같은 에너지 장치";
  if (/AI|인공지능|개인정보|사용\s*약속|생성형/.test(combined)) return "교실에서 안전한 AI 사용 약속을 확인하는 학생들";
  if (/바다|해양|물고기|거북|플라스틱/.test(combined)) return "바다 생물과 바다를 지키려는 사람들";
  if (/학교|교실|학생|안전/.test(combined)) return "학교 공간에서 안전하게 행동하는 학생들";
  if (/역사|조선|시장|시대/.test(combined)) return "시대 배경이 드러나는 사람들과 물건";
  return "학생이 말한 핵심 대상";
}

function inferBackground(topic: string, answerText: string) {
  const combined = `${topic} ${answerText}`;
  if (/신재생|재생\s*에너지|태양광|풍력|에너지/.test(combined)) return "태양광 패널, 풍력 발전기, 깨끗한 도시나 자연이 함께 보이는 공간";
  if (/AI|인공지능|개인정보|사용\s*약속|생성형/.test(combined)) return "칠판이나 게시판에 AI 사용 약속이 보이는 밝은 교실";
  if (/바다|해양|물고기|거북|플라스틱/.test(combined)) return "맑은 바닷속과 오염 문제 또는 회복된 해양 환경이 함께 드러나는 공간";
  if (/학교|교실|학생|안전/.test(combined)) return "교실, 복도, 운동장처럼 수업 주제가 드러나는 학교 공간";
  if (/역사|조선|시장|시대/.test(combined)) return "시대 배경, 건물, 의복, 물건이 자연스럽게 보이는 거리나 시장";
  return "수업 주제와 학생 답변이 구체적으로 드러나는 장소";
}

function inferAction(answerText: string) {
  if (/발견|해결|움직|노력|실천|지키|확인|나누|토론|의견/.test(answerText)) return "사람들이 문제를 발견하고 해결하려고 움직이는 순간.";
  if (/비교|전과\s*후|현재|미래/.test(answerText.replace(/\s/g, ""))) return "화면 안에서 변화 전후가 분명하게 비교되는 장면.";
  if (/즐기|웃|함께|협력/.test(answerText)) return "사람들이 함께 참여하고 협력하는 모습.";
  return "주제와 관련해 사람들이 무엇을 하고 있는지 행동이 분명하게 보이는 순간.";
}

function inferStyle(answerText: string) {
  if (/픽셀|pixel/i.test(answerText)) return "픽셀 아트 스타일";
  if (/수채화/.test(answerText)) return "부드러운 수채화 일러스트";
  if (/포스터/.test(answerText)) return "교육용 포스터 스타일";
  if (/만화|카툰/.test(answerText)) return "친근한 만화 일러스트";
  if (/사진|실사/.test(answerText)) return "현실적인 사진 스타일";
  return "선명한 디지털 일러스트";
}

function inferMood(answerText: string) {
  if (/희망|밝|깨끗|평화|즐거|긍정/.test(answerText)) return "밝고 희망적인";
  if (/위험|오염|문제|어두|긴장/.test(answerText)) return "문제 상황이 분명하지만 해결 가능성이 보이는";
  if (/역동|활동|움직/.test(answerText)) return "역동적인";
  return "주제가 분명하게 전달되는";
}

function isBarePromptRequest(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return PROMPT_REQUEST_PATTERN.test(normalized) && normalized.length <= 12;
}

function isWeakAnswer(input: string) {
  const normalized = input.trim().replace(/\s/g, "").toLowerCase();
  return /^(몰라|모름|없음|아무거나|아무생각없어|생각없어|대충|글쎄|잘모르겠어|잘모름|너가해|니가해|정답알려줘|답알려줘|asdf|qwer|test|\?+|!+|\.{2,})$/.test(normalized);
}
