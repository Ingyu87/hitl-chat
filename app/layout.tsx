import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HITL Prompt Builder",
  description: "교사 주제 기반 하이브리드 HITL 프롬프트 빌더"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
