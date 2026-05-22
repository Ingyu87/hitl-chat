import type { SafetyAlert } from "@/lib/types";

const PROFANITY = [/시발|씨발|개새끼|병신|지랄|fuck|shit|bitch/gi];
const SEXUAL = [/섹스|포르노|야동|음란/gi];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();

  if (/^(.)\1{9,}$/.test(trimmed) || trimmed.length < 2) {
    return {
      isSafe: false,
      alertType: "meaningless",
      message: "조금 더 구체적으로 적어볼까요? 오늘 주제 안에서 떠오른 생각을 한 문장으로 써 주세요."
    };
  }

  if ([...PROFANITY, ...SEXUAL].some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "수업에 맞지 않는 표현이 있어요. 선생님이 정한 주제 안에서 다시 적어볼까요?"
    };
  }

  return { isSafe: true };
}
