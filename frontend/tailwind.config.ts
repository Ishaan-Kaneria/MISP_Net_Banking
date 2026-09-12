import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1729",
        muted: "#5b6b83",
        subtle: "#8b98ab",
        paper: "#f2f5fa",
        border: "#dde5f0",
        navy: { DEFAULT: "#0a2547", deep: "#071a34" },
        primary: { DEFAULT: "#0b57b0", dark: "#083f82", light: "#e8f0fc" },
        gold: { DEFAULT: "#b3791f", light: "#faf1de" },
        danger: { DEFAULT: "#c0392b", light: "#fbeaea" },
        success: { DEFAULT: "#1f8a51", light: "#e6f6ec" },
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,37,71,.04), 0 8px 24px rgba(10,37,71,.06)",
        pop: "0 20px 45px rgba(7,26,52,.22)",
      },
      keyframes: {
        "rise": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(-6px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        rise: "rise .5s ease both",
        "pop-in": "pop-in .18s ease both",
      },
    },
  },
  plugins: [],
} satisfies Config;
