import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1c2e",
        muted: "#536276",
        surface: "#f8f9ff",
        panel: "#ffffff",
        line: "#d8e2f3",
        primary: "#006d36",
        primarySoft: "#dffbe8",
        secondary: "#00668a",
        secondarySoft: "#dff4ff",
        warning: "#735c00",
        warningSoft: "#fff3bd",
        danger: "#ba1a1a",
        dangerSoft: "#ffdad6"
      },
      boxShadow: {
        soft: "0 16px 50px rgba(13, 28, 46, 0.08)"
      },
      fontFamily: {
        sans: ["Pretendard", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
