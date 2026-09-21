import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0B0C',
        charcoal: '#16171A',
        graphite: '#33353A',
        slate: '#5C5F66',
        stone: '#8C8F96',
        muted: '#62656C',
        mist: '#D6D3CD',
        bone: '#EAE7E1',
        paper: '#F6F4F0',
        brand: {
          DEFAULT: '#009FE3',
          deep: '#006A9B',
          wash: '#E6F5FD',
        },
        clay: '#B9A78F',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.18em',
        tightest: '-0.045em',
      },
      maxWidth: {
        shell: '84rem',
        prose: '38rem',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translate3d(0, 18px, 0)' },
          '100%': { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        rise: 'rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
