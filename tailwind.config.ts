import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cream: "#FBF7F1",
          sand: "#F1E9DD",
          champagne: "#C7A769",
          "champagne-dark": "#AD8E54",
          charcoal: "#2B2723",
          stone: "#8A8278",
          line: "#E7DECE",
          sage: "#A9B5A0",
        },
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-cormorant)", "serif"],
      },
      letterSpacing: {
        widest: "0.2em",
        "ultra-wide": "0.3em",
      },
      maxWidth: {
        "8xl": "90rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
