import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://hitl-chat-gamma.vercel.app"),
  title: "생각잇기 프롬프트",
  description: "학생 답변 기반 이미지 생성 프롬프트 수업 도구",
  openGraph: {
    title: "생각잇기 프롬프트",
    description: "생각을 잇고, 질문을 열고, 함께 배우는 교실",
    siteName: "HITL Chat",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "생각잇기 프롬프트 HITL Chat"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "생각잇기 프롬프트",
    description: "생각을 잇고, 질문을 열고, 함께 배우는 교실",
    images: ["/opengraph-image"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
