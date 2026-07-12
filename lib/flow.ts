import { buildDraftPrompt, isFinalApproval, isPromptRequest, revisePrompt } from "@/lib/prompt-builder";
import { getInitialQuestionStage, getNextQuestionStage, getQuestionForStage } from "@/lib/question-flow";
import type { ChatMessage, FlowResult, SessionConfig, Stage } from "@/lib/types";

export function getInitialAssistantMessage(config: SessionConfig): string {
  return getQuestionForStage(config, getInitialQuestionStage(config));
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

  if (currentStage === "draft" || (currentStage === "final" && !latestPrompt)) {
    return createDraftPromptFlow(config, history);
  }

  if (currentStage === "revise" || currentStage === "final") {
    if (latestPrompt && isFinalApproval(studentInput)) {
      return {
        nextStage: "final",
        assistantMessage: "좋아요. 이 프롬프트를 최종본으로 확정했어요. 오른쪽 결과물에서 복사해 사용할 수 있어요.",
        shouldCreatePrompt: false,
        isFinal: true
      };
    }

    if (!latestPrompt || isPromptRequest(studentInput)) {
      return createDraftPromptFlow(config, history);
    }

    if (loopCount < config.maxLoopCount) {
      const draftPrompt = revisePrompt(latestPrompt, studentInput);
      return {
        nextStage: "revise",
        assistantMessage: `말해 준 내용을 장면 묘사로 정리해서 프롬프트를 다시 만들었어요.\n\n${draftPrompt}\n\n읽어보고 더 고칠 점을 말해 주세요. 괜찮으면 "이대로 확정"이라고 입력해 주세요.`,
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
    return createDraftPromptFlow(config, history);
  }

  return {
    nextStage,
    assistantMessage: getQuestionForStage(config, nextStage),
    shouldCreatePrompt: false,
    aiPurpose: "question_polish"
  };
}

function createDraftPromptFlow(config: SessionConfig, history: ChatMessage[]): FlowResult {
  const draftPrompt = buildDraftPrompt(config, history);
  return {
    nextStage: "revise",
    assistantMessage: `지금까지의 대화를 바탕으로 이미지 생성 프롬프트를 만들었어요.\n\n${draftPrompt}\n\n결과를 보고 고칠 점이 있으면 말해 주세요. 괜찮으면 "이대로 확정"이라고 입력해 주세요.`,
    draftPrompt,
    shouldCreatePrompt: true,
    promptSource: "rule",
    aiPurpose: "draft_prompt"
  };
}

