/** @type {import('tailwindcss').Config} */
export default {
  // ── Content Paths ─────────────────────────────────────────────────────────
  // Tailwind scans these files to purge unused classes in production builds.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      // ── Font Family ──────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },

      // ── Color Palette ─────────────────────────────────────────────────────
      colors: {
        // Design system tokens
        "charcoal-slate": "#1A1A1A",   // Primary text on light glassmorphic BG
        "admin-bg":       "#0B0F19",   // Deep slate-black admin backdrop

        // Status glow colors
        "status-pending":  "#ef4444",  // Urgent neon red — Pending/New
        "status-preparing":"#f59e0b",  // Amber/Yellow — Preparing/Cooking
        "status-served":   "#10b981",  // Vibrant emerald — Served/Ready
        "status-urgent":   "#f97316",  // Neon orange — 15-min kitchen timer
      },

      // ── Box Shadow ────────────────────────────────────────────────────────
      boxShadow: {
        // Status glow shadows for order ticket cards
        "glow-red":     "0 0 20px rgba(239,68,68,0.5),   0 4px 24px rgba(0,0,0,0.3)",
        "glow-amber":   "0 0 20px rgba(245,158,11,0.5),  0 4px 24px rgba(0,0,0,0.3)",
        "glow-emerald": "0 0 20px rgba(16,185,129,0.4),  0 4px 24px rgba(0,0,0,0.3)",
        "glow-orange":  "0 0 24px rgba(249,115,22,0.8),  0 4px 24px rgba(0,0,0,0.3)",
        "glow-indigo":  "0 4px 24px rgba(99,102,241,0.4)",
      },

      // ── Backdrop Blur ─────────────────────────────────────────────────────
      backdropBlur: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "40px",
      },

      // ── Animation ─────────────────────────────────────────────────────────
      keyframes: {
        "pulse-orange": {
          "0%, 100%": {
            boxShadow: "0 0 6px rgba(249,115,22,0.4), 0 0 20px rgba(249,115,22,0.2)",
          },
          "50%": {
            boxShadow:
              "0 0 16px rgba(249,115,22,0.9), 0 0 40px rgba(249,115,22,0.5), 0 0 60px rgba(249,115,22,0.2)",
          },
        },
        "alert-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "15%":      { transform: "translateX(-5px)" },
          "30%":      { transform: "translateX(5px)" },
          "45%":      { transform: "translateX(-4px)" },
          "60%":      { transform: "translateX(4px)" },
          "75%":      { transform: "translateX(-2px)" },
          "90%":      { transform: "translateX(2px)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-orange": "pulse-orange 1.8s ease-in-out infinite",
        "alert-shake":  "alert-shake 0.5s ease-in-out",
        fadeIn:         "fadeIn 0.25s ease-out both",
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },

  plugins: [],
};
