import type { ChatMessage, PromptRecord, SessionConfig, Stage, StudentWorkspace } from "@/lib/types";

export const RESTART_MARKER_PREFIX = "__HITL_RESTART__:";

// 마커 스냅샷이 저장 API의 메시지 길이 제한(2만 자)을 넘지 않는 범위에서 최근 대화를 최대한 담는다.
const MAX_SNAPSHOT_CHARS = 16000;

export type RestartRecord = {
  id: string;
  topic: string;
  createdAt: string;
  stage: Stage;
  messages: ChatMessage[];
  prompts: PromptRecord[];
};

export function createRestartMarkerMessage(student: StudentWorkspace, session: SessionConfig, createdAt: string): ChatMessage {
  const snapshot: RestartRecord = {
    id: crypto.randomUUID(),
    topic: student.lessonTopic ?? session.topic,
    createdAt,
    stage: student.currentStage,
    messages: takeRecentMessagesWithinBudget(getActiveMessages(student.messages)),
    prompts: student.prompts
  };

  return {
    id: crypto.randomUUID(),
    role: "system",
    content: `${RESTART_MARKER_PREFIX}${JSON.stringify(snapshot)}`,
    stage: student.currentStage,
    createdAt
  };
}

// 재시작 시 이전 활동은 마커 스냅샷에만 남기고, 활성 메시지 목록은 비워 기록이 눈덩이처럼 커지지 않게 한다.
export function buildRestartMessages(student: StudentWorkspace, session: SessionConfig, createdAt: string, greeting: ChatMessage): ChatMessage[] {
  return [...student.messages.filter(isRestartMarker), createRestartMarkerMessage(student, session, createdAt), greeting];
}

export function isRestartMarker(message: ChatMessage) {
  return message.role === "system" && message.content.startsWith(RESTART_MARKER_PREFIX);
}

function takeRecentMessagesWithinBudget(messages: ChatMessage[]) {
  const selected: ChatMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const cost = messages[index].content.length + 160;
    if (selected.length > 0 && used + cost > MAX_SNAPSHOT_CHARS) break;
    selected.unshift(messages[index]);
    used += cost;
  }
  return selected;
}

export function getActiveMessages(messages: ChatMessage[]) {
  let lastRestartIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isRestartMarker(messages[index])) {
      lastRestartIndex = index;
      break;
    }
  }
  return messages.slice(lastRestartIndex + 1).filter((message) => message.role !== "system");
}

export function getRestartRecords(student: StudentWorkspace): RestartRecord[] {
  return student.messages
    .filter(isRestartMarker)
    .map((message) => {
      try {
        const parsed = JSON.parse(message.content.slice(RESTART_MARKER_PREFIX.length)) as Partial<RestartRecord>;
        return {
          id: parsed.id ?? message.id,
          topic: parsed.topic ?? "",
          createdAt: parsed.createdAt ?? message.createdAt,
          stage: parsed.stage ?? message.stage,
          messages: parsed.messages ?? [],
          prompts: parsed.prompts ?? []
        };
      } catch {
        return null;
      }
    })
    .filter((record): record is RestartRecord => Boolean(record));
}
