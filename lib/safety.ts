import type { SafetyAlert } from "@/lib/types";

const PROFANITY_TERMS = [
  "\uc2dc\ubc1c",
  "\uc528\ubc1c",
  "\u3145\u3142",
  "\u3146\u3142",
  "\uac1c\uc0c8\ub07c",
  "\uc0c8\ub07c",
  "\ubcd1\uc2e0",
  "\ube59\uc2e0",
  "\uc874\ub098",
  "\uc878\ub77c",
  "\uc878\ub77d",
  "\uc878\ub77c",
  "\uc878",
  "\uc879",
  "fuck",
  "shit",
  "bitch"
];

const SEXUAL_TERMS = [
  "\ub098\uccb4",
  "\uc54c\ubab8",
  "\ub204\ub4dc",
  "\ubc97\uc740",
  "\ubc97\uace0",
  "\uc131\uc801",
  "\uc139\uc2a4",
  "\uc57c\ud55c",
  "\uc74c\ub780",
  "\uac00\uc2b4",
  "\uc131\uae30",
  "\uc790\uc704",
  "\ud3ec\ub974\ub178"
];

const ABUSIVE_TERMS = [
  "\uc8fd\uc5b4",
  "\uc8fd\uc5ec",
  "\uaebc\uc838",
  "\uba4d\uccad",
  "\ud610\uc624",
  "\uc655\ub530",
  "\uad34\ub86d"
];

export function checkSafety(input: string): { isSafe: boolean; alertType?: SafetyAlert["alertType"]; message?: string } {
  const trimmed = input.trim();
  const normalized = normalizeForSafety(trimmed);

  if (!trimmed) {
    return { isSafe: true };
  }

  if (includesAny(normalized, SEXUAL_TERMS)) {
    return {
      isSafe: false,
      alertType: "sexual",
      message: "음란하거나 성적인 표현은 이 수업 활동에서 사용할 수 없어요. 오늘 수업 주제에 맞는 안전한 장면으로 다시 적어 주세요."
    };
  }

  if (isAbusiveTowardPerson(normalized)) {
    return {
      isSafe: false,
      alertType: "abusive",
      message: "폭언, 모욕, 혐오 표현은 사용할 수 없어요. 사람을 존중하는 표현으로 바꾸어 다시 적어 주세요."
    };
  }

  if (includesAny(normalized, PROFANITY_TERMS)) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "욕설이나 비속어는 수업 대화에 사용할 수 없어요. 같은 생각이라도 바른 말로 바꾸어 다시 적어 주세요."
    };
  }

  return { isSafe: true };
}

function normalizeForSafety(input: string) {
  return input.toLowerCase().replace(/\s+/g, "");
}

function includesAny(input: string, terms: string[]) {
  return terms.some((term) => input.includes(term.toLowerCase().replace(/\s+/g, "")));
}

function isAbusiveTowardPerson(input: string) {
  if (!includesAny(input, ABUSIVE_TERMS)) return false;

  const environmentalUse = includesAny(input, [
    "\uc4f0\ub808\uae30\ub354\ubbf8",
    "\uc4f0\ub808\uae30\uc12c",
    "\uc624\uc5fc",
    "\uc704\ud5d8",
    "\uc8fd\uc740\ubb3c\uace0\uae30",
    "\ubc84\ub824\uc9c4\ubc14\ub2e4",
    "\uc790\uc5f0",
    "\ud50c\ub77c\uc2a4\ud2f1"
  ]);
  const personTarget = includesAny(input, [
    "\uc0ac\ub78c",
    "\uce5c\uad6c",
    "\uc120\uc0dd",
    "\ud559\uc0dd",
    "\uc5ec\uc790",
    "\ub0a8\uc790",
    "\uc544\uc774",
    "\ub108",
    "\uc598",
    "\uac1c"
  ]);
  if (environmentalUse && !personTarget) return false;

  return true;
}
