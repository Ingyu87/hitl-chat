import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hitl-chat-gamma.vercel.app";
const title = "생각잇기 프롬프트";
const description = "생각을 잇고, 질문을 열고, 함께 배우는 교실";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description: "학생 답변 기반 이미지 생성 프롬프트 수업 도구",
  openGraph: {
    title,
    description,
    siteName: "HITL Chat",
    type: "website",
    locale: "ko_KR",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "생각잇기 프롬프트 HITL Chat",
        type: "image/jpeg"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.jpg"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
