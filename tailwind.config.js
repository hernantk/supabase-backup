/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (see src/index.css) so the same classes render in light and dark.
const scale = (name, steps) =>
  Object.fromEntries(steps.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]))

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: scale('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        surface: scale('surface', [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI Variable Text"',
          '"Segoe UI"', 'system-ui', 'sans-serif',
        ],
        mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.05), 0 0 0 0.5px rgb(0 0 0 / 0.04)',
        float: '0 12px 32px rgb(0 0 0 / 0.18), 0 0 0 0.5px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
}
