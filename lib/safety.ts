import type { SafetyAlert } from "@/lib/types";

const PROFANITY = [/씨발|시발|병신|좆|개새끼|fuck|shit|bitch/gi];
const SEXUAL = [/섹스|자위|성관계|야동/gi];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();

  if (/^(.)\1{9,}$/.test(trimmed) || trimmed.length < 2) {
    return {
      isSafe: false,
      alertType: "meaningless",
      message: "아직 답변이 너무 짧거나 의미를 파악하기 어려워요. 떠오르는 장면이나 이유를 한 가지만 더 말해줄래요?"
    };
  }

  if ([...PROFANITY, ...SEXUAL].some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "수업과 맞지 않는 표현이 들어갔어요. 표현을 바꿔서 수업 주제와 관련된 생각을 다시 말해볼까요?"
    };
  }

  return { isSafe: true };
}
