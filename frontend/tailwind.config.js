const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        bg: c('bg'), surface: c('surface'), ink: c('text'), muted: c('muted'), line: c('line'),
        accent: c('accent'), 'on-accent': c('on-accent'), rail: '#0f0e0d',
      },
    },
  },
  plugins: [],
};
