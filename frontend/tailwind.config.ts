import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#160f2b",
        muted: "#6b6483",
        subtle: "#9891ab",
        paper: "#f8f7fd",
        border: "#e8e4f5",
        navy: { DEFAULT: "#1a0f33", deep: "#0d0818" },
        primary: { DEFAULT: "#7c3aed", dark: "#5f22c8", light: "#f1e8fe" },
        violet: { DEFAULT: "#7c3aed", light: "#f1e8fe" },
        fuchsia: { DEFAULT: "#ec4899", light: "#fce7f3" },
        orange: { DEFAULT: "#fb923c", light: "#ffedd5" },
        gold: { DEFAULT: "#d97706", light: "#fef3c7" },
        danger: { DEFAULT: "#e11d48", light: "#ffe4e9" },
        success: { DEFAULT: "#16a34a", light: "#dcfce7" },
      },
      fontFamily: {
        sans: ["var(--font-plex)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,15,43,.04), 0 10px 30px rgba(124,58,237,.08)",
        pop: "0 24px 60px rgba(22,15,43,.28)",
        glow: "0 8px 30px rgba(124,58,237,.35)",
      },
      backgroundImage: {
        brand: "linear-gradient(115deg, #7c3aed 0%, #ec4899 55%, #fb923c 100%)",
        "brand-soft": "linear-gradient(115deg, #ede4fe 0%, #fbe4f0 55%, #ffe9d4 100%)",
      },
      keyframes: {
        "rise": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(-6px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "blob-float": { "0%, 100%": { transform: "translate(0, 0) scale(1)" }, "50%": { transform: "translate(2%, -3%) scale(1.05)" } },
      },
      animation: {
        rise: "rise .5s ease both",
        "pop-in": "pop-in .18s ease both",
        "blob-float": "blob-float 14s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
