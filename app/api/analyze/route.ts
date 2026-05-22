import { callGeminiText, parseJsonObject } from "@/lib/gemini";
import type { StudentAnalysis, StudentWorkspace, SessionConfig } from "@/lib/types";

type AnalyzeBody = {
  session: SessionConfig;
  student: StudentWorkspace;
};

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeBody;
  const fallback: StudentAnalysis = {
    summary: "분석을 생성하지 못했습니다. 대화 기록을 직접 확인해 주세요.",
    conceptUnderstanding: "확인 필요",
    strengths: [],
    misconceptions: [],
    teacherRecommendations: ["학생의 대화 기록과 최종 프롬프트를 비교해 부족한 조건을 짚어 주세요."],
    nextQuestions: [],
    createdAt: new Date().toISOString()
  };

  try {
    const latest = body.student.prompts.at(-1);
    const final = body.student.prompts.find((prompt) => prompt.isFinal);
    const prompt = [
      "너는 교사용 프롬프트 수업 분석 보조 AI다.",
      "학생을 평가하거나 낙인찍지 말고, 교사가 다음 지도를 할 수 있게 구체적으로 분석한다.",
      "프롬프트 작성 관련 개념 인식에 초점을 둔다: 목적, 대상, 장면, 조건, 구체성, 제약, 수정 의도.",
      "반드시 JSON 객체만 출력한다.",
      "",
      `수업 주제: ${body.session.topic}`,
      `학습 목표: ${body.session.learningGoal}`,
      `최종 산출물: ${body.session.outputType}`,
      `필수 포함 요소: ${body.session.requiredElements.join(", ") || "없음"}`,
      `주의 요소: ${body.session.constraints.join(", ") || "없음"}`,
      `학생 이름: ${body.student.name}`,
      `최종/최신 프롬프트: ${final?.content || latest?.content || "아직 없음"}`,
      "",
      "대화 기록:",
      body.student.messages.map((message) => `${message.role === "user" ? "학생" : "챗봇"}(${message.stage}): ${message.content}`).join("\n"),
      "",
      "경고 기록:",
      body.student.safetyAlerts.map((alert) => `- ${alert.alertType}: ${alert.attemptedContent} / ${alert.reason || "사유 없음"}`).join("\n") || "- 없음",
      "",
      "JSON 형식:",
      '{"summary":"짧은 요약","conceptUnderstanding":"프롬프트 작성 개념 인식 수준 설명","strengths":["강점"],"misconceptions":["오해 또는 부족한 점"],"teacherRecommendations":["교사가 알려줄 점"],"nextQuestions":["다음 지도 질문"]}'
    ].join("\n");

    const text = await callGeminiText(prompt, { temperature: 0.25, maxOutputTokens: 1200 });
    const analysis = parseJsonObject<StudentAnalysis>(text, fallback);
    return Response.json({ analysis: { ...analysis, createdAt: new Date().toISOString() } });
  } catch {
    return Response.json({ analysis: fallback, fallbackReason: "analysis_failed" });
  }
}
