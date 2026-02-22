/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        editor: "#F5F4F2",
        "editor-muted": "#8E8E93",
        divider: "#D6D3CF",
        notelist: "#ECEAE7",
        "notelist-selected": "#DFDDD9",
        "sidebar-hover": "#DDDAD6",
        "sidebar-active": "#D3D0CB",
        "sidebar-text": "#3F3D3A",
        accent: "#A07B4A",
      },
      fontSize: {
        "2xs": ["0.6875rem", "0.95rem"],
      },
    },
  },
  plugins: [],
};
