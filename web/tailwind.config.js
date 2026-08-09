/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#12151f",
        border: "#232733",
        accent: "#4f8cff",
        long: "#22c55e",
        short: "#ef4444",
      },
    },
  },
  plugins: [],
};
