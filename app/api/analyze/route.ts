import { callAiJson } from "@/lib/ai-provider";
import type { SessionConfig, StudentAnalysis, StudentWorkspace } from "@/lib/types";

type AnalyzeBody = {
  session: SessionConfig;
  student: StudentWorkspace;
};

type AnalysisJson = Omit<StudentAnalysis, "createdAt">;

const analysisSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    conceptUnderstanding: { type: "STRING" },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    misconceptions: { type: "ARRAY", items: { type: "STRING" } },
    teacherRecommendations: { type: "ARRAY", items: { type: "STRING" } },
    nextQuestions: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["summary", "conceptUnderstanding", "strengths", "misconceptions", "teacherRecommendations", "nextQuestions"]
};

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeBody;
  const fallback = buildFallbackAnalysis(body);

  try {
    const latest = body.student.prompts.at(-1);
    const final = body.student.prompts.find((prompt) => prompt.isFinal);
    const prompt = [
      "You are a Korean learning analytics assistant for teachers.",
      "Analyze the student's conversation, safety alerts, and latest image-generation prompt.",
      "Return JSON only. No markdown.",
      "Every JSON value must be written in Korean.",
      "Be short, concrete, and useful for teacher feedback.",
      "",
      `Lesson topic: ${body.session.topic}`,
      `Learning goal: ${body.session.learningGoal}`,
      `Output type: ${body.session.outputType}`,
      `Required elements: ${body.session.requiredElements.join(", ") || "none"}`,
      `Constraints: ${body.session.constraints.join(", ") || "none"}`,
      `Student name: ${body.student.name}`,
      `Final/latest prompt: ${final?.content || latest?.content || "No prompt yet"}`,
      "",
      "Conversation:",
      body.student.messages.map((message) => `${message.role}(${message.stage}): ${message.content}`).join("\n") || "No conversation",
      "",
      "Safety alerts:",
      body.student.safetyAlerts.map((alert) => `- ${alert.alertType}: ${alert.attemptedContent} / ${alert.reason || "no reason"}`).join("\n") || "- none",
      "",
      "Return shape:",
      '{"summary":"학생 활동 요약","conceptUnderstanding":"개념 이해 수준","strengths":["강점"],"misconceptions":["오해 또는 부족한 점"],"teacherRecommendations":["교사 지도 제안"],"nextQuestions":["다음 질문"]}'
    ].join("\n");

    const parsed = await callAiJson<AnalysisJson | null>(prompt, null, {
      temperature: 0.25,
      maxOutputTokens: 1200,
      responseSchema: analysisSchema
    });

    return Response.json({
      analysis: normalizeAnalysis(parsed ? { ...parsed, createdAt: new Date().toISOString() } : fallback),
      aiUsed: Boolean(parsed)
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "analysis_failed";
    return Response.json({ analysis: fallback, aiUsed: false, fallbackReason: reason });
  }
}

function buildFallbackAnalysis(body: AnalyzeBody): StudentAnalysis {
  const final = body.student.prompts.find((prompt) => prompt.isFinal);
  const latest = body.student.prompts.at(-1);
  const userMessages = body.student.messages.filter((message) => message.role === "user");
  const hasPrompt = Boolean(final || latest);

  return {
    summary: hasPrompt
      ? `${body.student.name} 학생은 '${body.session.topic}' 주제로 이미지 프롬프트를 만들었습니다.`
      : `${body.student.name} 학생은 아직 최종 프롬프트를 완성하지 않았습니다.`,
    conceptUnderstanding: hasPrompt ? "학생 답변과 최신 프롬프트를 교사가 직접 확인해 이해 수준을 판단해야 합니다." : "프롬프트 완성 전이라 추가 확인이 필요합니다.",
    strengths: userMessages.length > 0 ? ["수업 대화에 참여했습니다."] : [],
    misconceptions: body.student.safetyAlerts.length > 0 ? ["안전 또는 관련성 경고가 있어 교사 확인이 필요합니다."] : [],
    teacherRecommendations: [
      "학생 대화 기록과 최신 프롬프트를 비교해 누락된 시각 요소를 짚어 주세요.",
      "장면, 중심 대상, 배경, 행동, 구도, 분위기가 구체적인지 확인해 주세요."
    ],
    nextQuestions: [
      "이 장면에서 가장 먼저 보여야 하는 대상은 무엇인가요?",
      "배경에는 어떤 문제 상황이나 해결 행동이 보여야 하나요?"
    ],
    createdAt: new Date().toISOString()
  };
}

function normalizeAnalysis(analysis: StudentAnalysis): StudentAnalysis {
  return {
    summary: analysis.summary || "분석 요약이 없습니다.",
    conceptUnderstanding: analysis.conceptUnderstanding || "확인 필요",
    strengths: Array.isArray(analysis.strengths) ? analysis.strengths : [],
    misconceptions: Array.isArray(analysis.misconceptions) ? analysis.misconceptions : [],
    teacherRecommendations: Array.isArray(analysis.teacherRecommendations) ? analysis.teacherRecommendations : [],
    nextQuestions: Array.isArray(analysis.nextQuestions) ? analysis.nextQuestions : [],
    createdAt: analysis.createdAt || new Date().toISOString()
  };
}
