import { callGeminiText, parseJsonObject } from "@/lib/gemini";
import type { StudentAnalysis, StudentWorkspace, SessionConfig } from "@/lib/types";

type AnalyzeBody = {
  session: SessionConfig;
  student: StudentWorkspace;
};

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
      "너는 교사를 돕는 학습 대화 분석 AI다.",
      "학생의 대화와 최종 이미지 프롬프트를 보고, 교사가 바로 지도에 활용할 수 있도록 짧고 구체적으로 분석한다.",
      "반드시 JSON만 출력한다. markdown을 쓰지 않는다.",
      "",
      `수업 주제: ${body.session.topic}`,
      `학습 목표: ${body.session.learningGoal}`,
      `최종 산출물: ${body.session.outputType}`,
      `필수 포함 요소: ${body.session.requiredElements.join(", ") || "없음"}`,
      `금지/주의 요소: ${body.session.constraints.join(", ") || "없음"}`,
      `학생 이름: ${body.student.name}`,
      `최종/최신 프롬프트: ${final?.content || latest?.content || "아직 프롬프트 없음"}`,
      "",
      "대화 기록:",
      body.student.messages.map((message) => `${message.role === "user" ? "학생" : "챗봇"}(${message.stage}): ${message.content}`).join("\n"),
      "",
      "경고 기록:",
      body.student.safetyAlerts.map((alert) => `- ${alert.alertType}: ${alert.attemptedContent} / ${alert.reason || "이유 없음"}`).join("\n") || "- 없음",
      "",
      "JSON 형식:",
      '{"summary":"학생 활동 요약","conceptUnderstanding":"개념 이해 수준","strengths":["강점"],"misconceptions":["오해 또는 부족한 점"],"teacherRecommendations":["교사 지도 제안"],"nextQuestions":["다음 질문"]}'
    ].join("\n");

    const text = await callGeminiText(prompt, {
      temperature: 0.25,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
      responseSchema: analysisSchema
    });
    const analysis = parseAnalysis(text, fallback);
    return Response.json({ analysis: normalizeAnalysis(analysis) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "analysis_failed";
    return Response.json({ analysis: fallback, fallbackReason: reason }, { status: 502 });
  }
}

function parseAnalysis(text: string, fallback: StudentAnalysis): StudentAnalysis {
  const parsed = parseJsonObject<StudentAnalysis | null>(text, null);
  if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") {
    return parsed;
  }

  const trimmed = text.trim();
  if (trimmed) {
    return {
      ...fallback,
      summary: trimmed.slice(0, 700),
      teacherRecommendations: ["Gemini가 구조화 JSON 대신 일반 텍스트 분석을 반환했습니다. 요약 내용을 바탕으로 지도해 주세요."]
    };
  }

  return fallback;
}

function buildFallbackAnalysis(body: AnalyzeBody): StudentAnalysis {
  const final = body.student.prompts.find((prompt) => prompt.isFinal);
  const latest = body.student.prompts.at(-1);
  return {
    summary: final || latest ? "분석을 생성하지 못했습니다. 최신 프롬프트와 대화 기록을 직접 확인해 주세요." : "아직 분석할 최종 프롬프트가 없습니다.",
    conceptUnderstanding: "확인 필요",
    strengths: [],
    misconceptions: body.student.safetyAlerts.length > 0 ? ["무성의하거나 주제와 약하게 연결된 답변이 포함되어 있습니다."] : [],
    teacherRecommendations: ["학생의 대화 기록과 최종 프롬프트를 비교해 부족한 조건을 짚어 주세요."],
    nextQuestions: ["이 장면에서 꼭 보여주고 싶은 핵심 요소는 무엇인가요?"],
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
    createdAt: new Date().toISOString()
  };
}
