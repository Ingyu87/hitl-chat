import { STAGES } from "@/lib/defaults";
import { buildDraftPrompt, revisePrompt } from "@/lib/prompt-builder";
import type { ChatMessage, FlowResult, SessionConfig, Stage } from "@/lib/types";

const ORDER = STAGES.map((item) => item.stage);

export function getInitialAssistantMessage(config: SessionConfig): string {
  const custom = config.questionFlow.find((item) => item.stage === "orient")?.question;
  return custom ?? `오늘 주제는 "${config.topic}"이야. 이 주제를 듣고 가장 먼저 떠오르는 생각을 한 문장으로 말해줘.`;
}

export function getNextFlow(args: {
  config: SessionConfig;
  history: ChatMessage[];
  studentInput: string;
  currentStage: Stage;
  latestPrompt?: string;
  loopCount: number;
}): FlowResult {
  const { config, history, studentInput, currentStage, latestPrompt, loopCount } = args;

  if (currentStage === "describe") {
    const draftPrompt = buildDraftPrompt(config, history);
    return {
      nextStage: "revise",
      assistantMessage: `지금까지 네가 직접 답한 내용을 바탕으로 프롬프트 초안을 만들었어.\n\n${draftPrompt}\n\n이 프롬프트에서 바꾸고 싶은 부분이 있을까? 더 넣고 싶은 조건, 빼고 싶은 표현, 분위기나 장면 수정이 있으면 말해줘. 괜찮으면 "이걸로 확정할래요"라고 답하면 돼.`,
      draftPrompt,
      shouldCreatePrompt: true,
      promptSource: "rule",
      aiPurpose: "draft_prompt"
    };
  }

  if (currentStage === "revise") {
    if (isFinalApproval(studentInput)) {
      return {
        nextStage: "final",
        assistantMessage: "좋아. 이 프롬프트를 최종본으로 저장했어. 선생님 화면에서도 확인할 수 있어.",
        shouldCreatePrompt: false,
        isFinal: true
      };
    }

    if (latestPrompt && loopCount < config.maxLoopCount) {
      const draftPrompt = revisePrompt(latestPrompt, studentInput);
      return {
        nextStage: "revise",
        assistantMessage: `네 수정 요청을 반영해서 새 버전을 만들었어.\n\n${draftPrompt}\n\n아직 어색하거나 더 고치고 싶은 부분이 있을까? 괜찮으면 "이걸로 확정할래요"라고 답하면 돼.`,
        draftPrompt,
        shouldCreatePrompt: true,
        promptSource: "student_revision",
        aiPurpose: "revise_prompt"
      };
    }

    return {
      nextStage: "final",
      assistantMessage: "수정 횟수 제한에 도달해서 현재 프롬프트를 최종본으로 저장했어.",
      shouldCreatePrompt: false,
      isFinal: true
    };
  }

  if (currentStage === "final") {
    return {
      nextStage: "final",
      assistantMessage: "이미 최종 프롬프트가 저장되었어. 선생님 화면에서 확인할 수 있어.",
      shouldCreatePrompt: false
    };
  }

  const nextStage = nextOf(currentStage);
  return {
    nextStage,
    assistantMessage: buildQuestion(config, nextStage),
    shouldCreatePrompt: false,
    aiPurpose: ["explore", "concrete", "describe"].includes(nextStage) ? "question_polish" : undefined
  };
}

function nextOf(stage: Stage): Stage {
  const index = ORDER.indexOf(stage);
  return ORDER[Math.min(index + 1, ORDER.length - 1)];
}

function buildQuestion(config: SessionConfig, stage: Stage): string {
  const custom = config.questionFlow.find((item) => item.stage === stage)?.question;
  if (custom) return custom;

  if (stage === "explore") {
    return `"${config.topic}" 안에서 네가 가장 표현해보고 싶은 방향은 무엇이니?`;
  }

  if (stage === "concrete") {
    return "그 아이디어를 더 구체적으로 만들기 위해 장소, 대상, 상황, 문제 해결 방법을 말해줘.";
  }

  if (stage === "describe") {
    return "최종 산출물에 보이면 좋을 색, 분위기, 형태, 필수 요소를 자세히 말해줘.";
  }

  return "좋아. 다음 생각을 이어서 말해줘.";
}

function isFinalApproval(input: string): boolean {
  return /확정|최종|좋아요|좋아|괜찮|이걸로|완성|승인/.test(input.replace(/\s/g, ""));
}
