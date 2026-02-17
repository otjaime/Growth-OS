/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#0a84ff',
          600: '#0a84ff',
          700: '#0071e3',
          900: '#1e3a5f',
        },
        apple: {
          blue: '#0a84ff',
          green: '#30d158',
          red: '#ff453a',
          yellow: '#ffd60a',
          purple: '#bf5af2',
          orange: '#ff9f0a',
          pink: '#ff375f',
          teal: '#64d2ff',
          indigo: '#5e5ce6',
          gray: '#98989f',
        },
      },
      borderRadius: {
        glass: 'var(--radius-xl)',
        'glass-sm': 'var(--radius-md)',
        'glass-lg': 'var(--radius-2xl)',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        'glass-elevated': 'var(--shadow-elevated)',
      },
      transitionTimingFunction: {
        spring: 'var(--ease-spring)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};
