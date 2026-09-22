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
        // The cyan is the client's logo mark and is used for the mark alone.
        brand: {
          DEFAULT: '#009FE3',
          deep: '#006A9B',
        },
        // Editorial accent. Warm metal reads as architectural materials where
        // the cyan read as software. Two tones because no single value clears
        // 4.5:1 on both paper and ink.
        bronze: {
          DEFAULT: '#8A530B', // on paper / bone
          light: '#C99A3E', // on ink / charcoal
          wash: '#F2EAD9',
        },
        clay: '#B9A78F',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
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
        // Each word of a headline climbs out from behind a clipping mask.
        wordUp: {
          '0%': { opacity: '0', transform: 'translate3d(0, 108%, 0)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        // Page content settles in after a route change. Opacity only: a
        // transform here — even one that resolves to the identity matrix —
        // turns the wrapper into the containing block for every position:fixed
        // child, which strands the sticky mobile CTA bar down the page.
        pageIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        // Loading screen: the mark breathes while assets download.
        pulseRing: {
          '0%': { opacity: '0.55', transform: 'scale(1)' },
          '70%, 100%': { opacity: '0', transform: 'scale(1.9)' },
        },
        marquee: {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '100%': { transform: 'translate3d(-50%, 0, 0)' },
        },
      },
      animation: {
        rise: 'rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'word-up': 'wordUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'page-in': 'pageIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-ring': 'pulseRing 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        marquee: 'marquee 38s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
