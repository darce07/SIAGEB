/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        "glass": "rgba(15, 23, 42, 0.6)",
      },
      boxShadow: {
        "glass": "0 10px 30px rgba(15, 23, 42, 0.35)",
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
