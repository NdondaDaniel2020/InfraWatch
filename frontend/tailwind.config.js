import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-primary, #eab308)",
          hover: "var(--brand-primary-hover, #ca8a04)",
          glow: "var(--brand-glow, rgba(234, 179, 8, 0.25))",
        },
        obsidian: {
          950: "#070a12",
          900: "#0d1424",
          850: "#131c30",
          800: "#1b2640",
          750: "#223152",
          700: "#2a395e",
          600: "#3d5180",
        },
        status: {
          healthy: "#10b981",
          degraded: "#f59e0b",
          critical: "#f43f5e",
          maint: "#38bdf8",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        "card-glass": "0 25px 70px -15px rgba(0, 0, 0, 0.7), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
        "glow-brand": "0 0 24px -3px var(--brand-glow, rgba(234, 179, 8, 0.35))",
      },
    },
  },
  plugins: [forms, containerQueries, animate],
};
