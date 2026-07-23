import type { AiAssistLog, AiPurpose } from "@/lib/types";

export const STUDENT_QUOTA_PURPOSES = ["question_polish", "draft_prompt", "revise_prompt"] as const;

type StudentQuotaPurpose = (typeof STUDENT_QUOTA_PURPOSES)[number];

function isStudentQuotaPurpose(purpose: AiPurpose): purpose is StudentQuotaPurpose {
  return (STUDENT_QUOTA_PURPOSES as readonly string[]).includes(purpose);
}

/** Counts only student-facing AI assists toward the per-student quota. */
export function countStudentAiUsage(logs: AiAssistLog[]) {
  return logs.filter((log) => log.used && isStudentQuotaPurpose(log.purpose)).length;
}
