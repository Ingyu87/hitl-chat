import type { SafetyAlert } from "@/lib/types";

const PROFANITY = [/씨발|시발|ㅅㅂ|병신|븅신|좆|존나|개새끼|미친놈|미친년|fuck|shit|bitch/gi];
const SEXUAL = [/섹스|자위|성관계|야동|가슴|성기|보지|자지/gi];
const ABUSIVE = [/죽어|꺼져|때릴|죽일|패버|닥쳐|멍청|쓰레기|혐오|왕따/gi];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();

  if (/^(.)\1{9,}$/.test(trimmed) || trimmed.length < 2) {
    return {
      isSafe: false,
      alertType: "meaningless",
      message: "아직 답변이 너무 짧거나 의미를 파악하기 어려워요. 떠오르는 장면이나 이유를 한 가지만 더 말해 주세요."
    };
  }

  if (SEXUAL.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "sexual",
      message: "음란하거나 성적인 내용은 이 활동에서 다룰 수 없어요. 수업 주제에 맞게 다시 답해 주세요."
    };
  }

  if (ABUSIVE.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "abusive",
      message: "폭언, 모욕, 위협하는 말은 허용되지 않아요. 상대를 존중하는 표현으로 다시 답해 주세요."
    };
  }

  if (PROFANITY.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 표현을 바꿔서 다시 답해 주세요."
    };
  }

  return { isSafe: true };
}
