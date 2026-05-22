import { buildDraftPrompt, revisePrompt } from "@/lib/prompt-builder";
import { getQuestionForStage, STAGE_ORDER } from "@/lib/question-flow";
import type { ChatMessage, FlowResult, SessionConfig, Stage } from "@/lib/types";

export function getInitialAssistantMessage(config: SessionConfig): string {
  return getQuestionForStage(config, "orient");
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

  if (currentStage === "draft") {
    const draftPrompt = buildDraftPrompt(config, history);
    return {
      nextStage: "revise",
      assistantMessage: `지금까지 말해준 내용을 바탕으로 첫 프롬프트 초안을 만들어봤어요.\n\n${draftPrompt}\n\n읽어보고 더 넣고 싶은 것, 빼고 싶은 것, 바꾸고 싶은 표현이 있으면 편하게 말해줘요. 이대로 확정해도 괜찮아요.`,
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
        assistantMessage: "좋아요. 이 프롬프트를 최종본으로 확정했어요.",
        shouldCreatePrompt: false,
        isFinal: true
      };
    }

    if (latestPrompt && loopCount < config.maxLoopCount) {
      const draftPrompt = revisePrompt(latestPrompt, studentInput);
      return {
        nextStage: "revise",
        assistantMessage: `말해준 수정 의견을 반영해봤어요.\n\n${draftPrompt}\n\n이제 이걸로 확정할까요, 아니면 한 번 더 다듬을까요?`,
        draftPrompt,
        shouldCreatePrompt: true,
        promptSource: "student_revision",
        aiPurpose: "revise_prompt"
      };
    }

    return {
      nextStage: "final",
      assistantMessage: "수정할 수 있는 횟수를 모두 사용했어요. 지금 프롬프트를 최종본으로 확정할게요.",
      shouldCreatePrompt: false,
      isFinal: true
    };
  }

  if (currentStage === "final") {
    return {
      nextStage: "final",
      assistantMessage: "최종 프롬프트가 확정되어 있어요. 선생님 화면에서 결과를 확인할 수 있습니다.",
      shouldCreatePrompt: false
    };
  }

  const nextStage = nextOf(currentStage);
  return {
    nextStage,
    assistantMessage: getQuestionForStage(config, nextStage),
    shouldCreatePrompt: false,
    aiPurpose: ["orient", "explore", "concrete", "describe"].includes(nextStage) ? "question_polish" : undefined
  };
}

function nextOf(stage: Stage): Stage {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
}

function isFinalApproval(input: string): boolean {
  return /(확정|좋아요|좋아|그대로|완성|최종|오케이|ok|OK|yes|네|응|이대로)/.test(input.replace(/\s/g, ""));
}
