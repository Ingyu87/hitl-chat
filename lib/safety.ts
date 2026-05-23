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
      message: "\uc131\uc801\uc778 \ub0b4\uc6a9\uc740 \uc774 \uc218\uc5c5 \ud65c\ub3d9\uc5d0\uc11c \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc5b4\uc694. \uc218\uc5c5 \uc8fc\uc81c\uc5d0 \ub9de\ub294 \uc7a5\uba74\uc73c\ub85c \ub2e4\uc2dc \ub9d0\ud574 \uc8fc\uc138\uc694."
    };
  }

  if (isAbusiveTowardPerson(normalized)) {
    return {
      isSafe: false,
      alertType: "abusive",
      message: "\ud3ed\uc5b8, \ubaa8\uc695, \ud610\uc624 \ud45c\ud604\uc740 \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc5b4\uc694. \uc0c1\ub300\ub97c \uc874\uc911\ud558\ub294 \ud45c\ud604\uc73c\ub85c \ub2e4\uc2dc \ub9d0\ud574 \uc8fc\uc138\uc694."
    };
  }

  if (includesAny(normalized, PROFANITY_TERMS)) {
    return {
      isSafe: false,
      alertType: "profanity",
      message: "\uc695\uc124\uc774\ub098 \ube44\uc18d\uc5b4\ub294 \uc218\uc5c5 \ub300\ud654\uc5d0 \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc5b4\uc694. \ud45c\ud604\uc744 \ubc14\uafd4\uc11c \ub2e4\uc2dc \ub9d0\ud574 \uc8fc\uc138\uc694."
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
