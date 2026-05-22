import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "생각잇기 프롬프트",
  description: "학생 답변 기반 AI 프롬프트 수업 도구"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
