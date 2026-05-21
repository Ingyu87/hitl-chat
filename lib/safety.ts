import type { SafetyAlert } from "@/lib/types";

const PROFANITY = [/씨발|시발|병신|좆|fuck|shit|bitch/gi];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();

  if (/^(.)\1{9,}$/.test(trimmed) || trimmed.length < 2) {
    return {
      isSafe: false,
      alertType: "meaningless",
      message: "조금 더 구체적으로 말해줘. 한 단어나 반복 글자보다는 네 생각이 담긴 문장이 좋아."
    };
  }

  if (PROFANITY.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "수업 활동에 맞는 말로 다시 적어줘. 네 아이디어를 차분하게 표현하면 돼."
    };
  }

  return { isSafe: true };
}
