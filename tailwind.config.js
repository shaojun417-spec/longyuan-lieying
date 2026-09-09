/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./electron/src/renderer/**/*.{js,ts,jsx,tsx}",
    "./electron/src/renderer/index.html",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        accent: {
          500: '#f97316',
          600: '#ea580c',
        },
      },
      fontFamily: {
        sans: ['Microsoft JhengHei', 'PingFang TC', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
