import type { SafetyAlert } from "@/lib/types";

const PROFANITY = [/씨발|시발|ㅅㅂ|병신|븅신|존나|좆|fuck|shit|bitch/gi];
const SEXUAL = [/섹스|자위|성기|가슴|보지|자지/gi];
const ABUSIVE = [/죽어|꺼져|죽일|때릴|멍청|쓰레기 같은 사람|혐오|왕따/gi];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();

  if (!trimmed) {
    return { isSafe: true };
  }

  if (SEXUAL.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "sexual",
      message: "성적인 내용은 이 활동에서 사용할 수 없어요. 수업 주제에 맞는 장면으로 다시 말해 주세요."
    };
  }

  if (isAbusiveTowardPerson(trimmed)) {
    return {
      isSafe: false,
      alertType: "abusive",
      message: "위협, 모욕, 혐오 표현은 사용할 수 없어요. 상대를 존중하는 표현으로 다시 말해 주세요."
    };
  }

  if (PROFANITY.some((pattern) => pattern.test(trimmed))) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 표현을 바꾸어 다시 말해 주세요."
    };
  }

  return { isSafe: true };
}

function isAbusiveTowardPerson(input: string) {
  if (!ABUSIVE.some((pattern) => pattern.test(input))) return false;
  if (/쓰레기|오염|냄새|위험|죽은 물고기|더러운 바다|폐수|플라스틱/.test(input) && !/너|쟤|사람|친구|선생|학생/.test(input)) {
    return false;
  }
  return true;
}
