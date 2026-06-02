module.exports = {
  content: ['./index.html', './tweaks-panel.jsx', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1326',
        paper: '#FBF8F1',
        yel: '#FFF44F',
        tone: {
          amber: { bg: '#FEF3C7', fg: '#B45309' },
          blue:  { bg: '#DBEAFE', fg: '#1D4ED8' },
          emerald: { bg: '#D1FAE5', fg: '#047857' },
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      letterSpacing: {
        'tight-1': '-0.02em',
        'tight-2': '-0.03em',
        'tight-3': '-0.04em',
      },
    }
  },
  plugins: []
};
