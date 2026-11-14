import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sanctuary: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
        canvas: {
          DEFAULT: '#F8FAFC',
          warm: '#FAF9F6',
          surface: '#FFFFFF',
          border: '#E2E8F0',
        },
        ink: {
          DEFAULT: '#0F172A',
          secondary: '#334155',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans Thai"',
          '"IBM Plex Sans Thai"',
          '"Sarabun"',
          '"Leelawadee UI"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};

export default config;
