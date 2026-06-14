/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // theme flips by toggling the `dark` class on <html>
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // distinctive trio: Space Grotesk (display) · Manrope (body) · JetBrains Mono (numbers)
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Semantic tokens driven by CSS variables (defined in index.css).
        // Each is an RGB triplet so Tailwind's /opacity utilities still work.
        app: 'rgb(var(--app) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        inset: 'rgb(var(--inset) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        pos: 'rgb(var(--pos) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        // fixed accent (same in both themes)
        brand: {
          50: '#eafff6', 100: '#cdfdea', 200: '#9ff7d6', 300: '#5deebd',
          400: '#22d99e', 500: '#06bd84', 600: '#019a6c', 700: '#057a59',
          800: '#0a6048', 900: '#0b4f3d',
        },
        ink: { 950: '#05080b', 900: '#0a0f14', 850: '#0e151c', 800: '#121b24' },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,217,158,.25), 0 10px 40px -10px rgba(6,189,132,.45)',
        soft: '0 1px 2px rgba(0,0,0,.06), 0 12px 30px -18px rgba(0,0,0,.25)',
        lift: '0 30px 60px -25px rgba(0,0,0,.5)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pulseGlow: { '0%,100%': { opacity: .5 }, '50%': { opacity: 1 } },
      },
      animation: {
        fadeUp: 'fadeUp .4s ease both',
        pulseGlow: 'pulseGlow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
