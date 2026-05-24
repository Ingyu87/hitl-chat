import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "생각잇기 프롬프트 HITL Chat";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 88% 28%, #8bb9ff 0, #5f6df6 23%, transparent 42%), linear-gradient(135deg, #ffffff 0%, #eef8ff 48%, #d9eeff 100%)",
          fontFamily: "sans-serif"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 60% 82%, rgba(74, 170, 255, 0.26), transparent 38%), radial-gradient(circle at 96% 88%, rgba(68, 219, 183, 0.22), transparent 30%)"
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 74,
            top: 104,
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ fontSize: 92, lineHeight: 0.98, fontWeight: 900, color: "#071d4b", letterSpacing: "-2px" }}>
            생각잇기
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 82,
              lineHeight: 1,
              fontWeight: 900,
              background: "linear-gradient(90deg, #6655ff, #16c3ad)",
              backgroundClip: "text",
              color: "transparent",
              letterSpacing: "-1px"
            }}
          >
            프롬프트
          </div>

          <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 116, height: 5, borderRadius: 99, background: "#6c63ff" }} />
            <div style={{ width: 12, height: 12, borderRadius: 99, background: "#35a7ff" }} />
            <div style={{ width: 92, height: 5, borderRadius: 99, background: "#18c7b0" }} />
          </div>

          <div style={{ marginTop: 28, fontSize: 35, fontWeight: 800, color: "#273a5b" }}>HITL Chat</div>
          <div style={{ marginTop: 16, fontSize: 24, fontWeight: 700, color: "#39516f" }}>
            생각을 잇고, 질문을 열고, 함께 배우는 교실
          </div>

          <div style={{ marginTop: 30, display: "flex", gap: 14 }}>
            {["생각을 연결해요", "질문으로 탐구해요", "AI와 함께 배워요"].map((label, index) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 18px",
                  borderRadius: 22,
                  background: index === 0 ? "#e9f4ff" : index === 1 ? "#e9fbff" : "#f1edff",
                  color: index === 0 ? "#2d65d8" : index === 1 ? "#068b9b" : "#6d56db",
                  fontSize: 16,
                  fontWeight: 800
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 628,
            top: 112,
            width: 300,
            height: 320,
            borderRadius: 28,
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 28px 70px rgba(30, 70, 150, 0.18)",
            border: "1px solid rgba(137, 170, 220, 0.32)",
            display: "flex",
            flexDirection: "column",
            padding: 30
          }}
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 99,
                background: "linear-gradient(135deg,#18bfd1,#5578ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 22,
                fontWeight: 900
              }}
            >
              AI
            </div>
            <div style={{ width: 126, height: 8, borderRadius: 99, background: "#c8d6e9" }} />
          </div>
          <div style={{ marginTop: 34, height: 74, borderRadius: 16, background: "#dff6fb" }} />
          <div style={{ marginTop: 24, height: 74, borderRadius: 16, background: "#eeeaff" }} />
          <div
            style={{
              marginTop: 28,
              height: 42,
              borderRadius: 22,
              background: "#f5f9ff",
              color: "#8da0b5",
              display: "flex",
              alignItems: "center",
              paddingLeft: 24,
              fontSize: 15,
              fontWeight: 700
            }}
          >
            질문을 입력하세요...
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 72,
            top: 214,
            width: 210,
            height: 220,
            borderRadius: 20,
            background: "rgba(255,255,255,0.58)",
            border: "1px solid rgba(255,255,255,0.54)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <svg width="126" height="92" viewBox="0 0 126 92" fill="none">
            <path d="M22 68L45 28L73 57L102 19" stroke="#2bb6c5" strokeWidth="6" strokeLinecap="round" />
            <circle cx="22" cy="68" r="10" fill="#5d6ff4" />
            <circle cx="45" cy="28" r="10" fill="#7b63f1" />
            <circle cx="73" cy="57" r="10" fill="#35bfd6" />
            <circle cx="102" cy="19" r="10" fill="#24b5b9" />
          </svg>
        </div>

        <div
          style={{
            position: "absolute",
            left: 560,
            bottom: 46,
            width: 250,
            height: 96,
            borderRadius: 20,
            background: "#fff9e8",
            boxShadow: "0 18px 42px rgba(60, 80, 120, 0.14)",
            transform: "rotate(-3deg)",
            display: "flex",
            flexDirection: "column",
            padding: "24px 30px",
            color: "#4a5265",
            fontSize: 20,
            fontWeight: 800
          }}
        >
          <div>생각 → 질문</div>
          <div>질문 → 이해</div>
          <div>이해 → 성장</div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 70,
            bottom: 48,
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          {["#17c7be", "#4d84e8", "#8b67e9"].map((color, index) => (
            <div
              key={color}
              style={{
                width: 176,
                height: 32,
                borderRadius: 10,
                background: color,
                boxShadow: "0 10px 22px rgba(45, 70, 150, 0.18)",
                transform: `translateX(${index * 8}px)`
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            right: 130,
            top: 54,
            width: 72,
            height: 72,
            borderRadius: 99,
            background: "#ffd95f",
            boxShadow: "0 0 36px rgba(255, 217, 95, 0.72)"
          }}
        />
      </div>
    ),
    {
      ...size
    }
  );
}
