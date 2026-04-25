import type { Config } from 'tailwindcss';

export default {
  content: ['./src/popup/**/*.{html,tsx,ts}', './src/styles/**/*.css'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
