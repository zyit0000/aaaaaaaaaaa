/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Sidebar ──────────────────────────────────────────────────────────
        sidebar: {
          DEFAULT: "#E6E4E1",
          hover:   "#D9D7D3",
          active:  "#CCC9C4",
          text:    "#3A3938",
        },
        // ── Note List ─────────────────────────────────────────────────────────
        notelist: {
          DEFAULT:  "#F5F4F2",
          selected: "#E8E6E3",
          border:   "#D8D6D2",
        },
        // ── Editor ────────────────────────────────────────────────────────────
        editor: {
          DEFAULT: "#FFFFFF",
          text:    "#1C1C1E",
          muted:   "#8E8E93",
        },
        // ── Accent (iCloud folder / selected highlight) ───────────────────────
        accent: {
          DEFAULT: "#E3A008",
          light:   "#F6C94E",
        },
        // ── Borders ───────────────────────────────────────────────────────────
        divider: "#D1CFCB",
      },
      fontFamily: {
        // Match macOS system font stack (SF Pro / Helvetica Neue fallback)
        system: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "Menlo",
          "Monaco",
          "Consolas",
          '"Courier New"',
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
      },
      spacing: {
        sidebar: "220px",
        notelist: "260px",
      },
    },
  },
  plugins: [],
};