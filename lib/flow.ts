import { buildDraftPrompt, revisePrompt } from "@/lib/prompt-builder";
import { getNextQuestionStage, getQuestionForStage } from "@/lib/question-flow";
import type { ChatMessage, FlowResult, SessionConfig, Stage } from "@/lib/types";

export function getInitialAssistantMessage(config: SessionConfig): string {
  return getQuestionForStage(config, config.questionFlow[0]?.stage || "orient");
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
      assistantMessage: `지금까지의 대화를 바탕으로 이미지 생성 프롬프트 초안을 만들었어요.\n\n${draftPrompt}\n\n읽어보고 더 넣고 싶은 것, 빼고 싶은 것, 바꾸고 싶은 표현이 있으면 말해 주세요. 이대로 확정해도 괜찮아요.`,
      draftPrompt,
      shouldCreatePrompt: true,
      promptSource: "rule",
      aiPurpose: "draft_prompt"
    };
  }

  if (currentStage === "revise" || currentStage === "final") {
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
        assistantMessage: `수정 의견을 반영해서 프롬프트를 다시 다듬었어요.\n\n${draftPrompt}\n\n이제 이걸로 확정할까요, 아니면 한 번 더 바꿀까요?`,
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

  const nextStage = getNextQuestionStage(config, currentStage);
  if (nextStage === "draft") {
    return {
      nextStage: "draft",
      assistantMessage: getQuestionForStage(config, "draft"),
      shouldCreatePrompt: false
    };
  }

  return {
    nextStage,
    assistantMessage: getQuestionForStage(config, nextStage),
    shouldCreatePrompt: false,
    aiPurpose: "question_polish"
  };
}

function isFinalApproval(input: string): boolean {
  return /(확정|좋아|그대로|완성|최종|이대로|ok|yes)/i.test(input.replace(/\s/g, ""));
}
