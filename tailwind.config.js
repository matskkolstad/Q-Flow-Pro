/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.{js,ts,jsx,tsx}',
    './index.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './context/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand colour scale. Values come from CSS variables set from the admin's brand colour
        // (see utils/color.ts); defaults are Tailwind's indigo.
        brand: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [step, `rgb(var(--brand-${step}) / <alpha-value>)`]),
        ),
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'print-ticket': 'print 1.5s ease-out forwards',
        'flash': 'flash 1.5s infinite',
        'marquee': 'marquee 25s linear infinite',
      },
      keyframes: {
        print: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        flash: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(0.98)' },
        },
        marquee: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [],
};
