import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        inverse: 'var(--bg-inverse)',
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          pressed: 'var(--brand-pressed)',
          accent: 'var(--brand-accent)',
          soft: 'var(--bg-brand-soft)',
          'soft-strong': 'var(--bg-brand-soft-strong)',
        },
        fg: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          brand: 'var(--text-brand)',
          'on-brand': 'var(--text-on-brand)',
          inverse: 'var(--text-inverse)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          brand: 'var(--border-brand)',
        },
        warning: {
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
          text: 'var(--warning-text)',
          icon: 'var(--warning-icon)',
        },
        danger: {
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
          text: 'var(--danger-text)',
          icon: 'var(--danger-icon)',
          fill: 'var(--danger-fill)',
          'fill-hover': 'var(--danger-fill-hover)',
        },
        info: {
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
          text: 'var(--info-text)',
          icon: 'var(--info-icon)',
        },
        tier: {
          'cold-bg': 'var(--tier-cold-bg)',
          'cold-fg': 'var(--tier-cold-fg)',
          'warm-bg': 'var(--tier-warm-bg)',
          'warm-fg': 'var(--tier-warm-fg)',
          'hot-bg': 'var(--tier-hot-bg)',
          'hot-fg': 'var(--tier-hot-fg)',
          'premium-bg': 'var(--tier-premium-bg)',
          'premium-fg': 'var(--tier-premium-fg)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['clamp(2rem, 1.4rem + 2.6vw, 3.5rem)', { lineHeight: '1.15', fontWeight: '700' }],
        h1: ['clamp(1.625rem, 1.3rem + 1.2vw, 2rem)', { lineHeight: '1.3', fontWeight: '600' }],
        h2: ['1.5rem', { lineHeight: '1.35', fontWeight: '600' }],
        h3: ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        h4: ['1.125rem', { lineHeight: '1.45', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.75' }],
        body: ['var(--text-body-size)', { lineHeight: '1.7' }],
        'body-sm': ['0.875rem', { lineHeight: '1.65' }],
        label: ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        sm: '0.5rem',   // 8px
        md: '0.75rem',  // 12px
        lg: '1rem',     // 16px
        xl: '1.5rem',   // 24px
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--ring-focus)',
      },
      height: {
        control: 'var(--control-h)',
        row: 'var(--row-h)',
        nav: 'var(--nav-item-h)',
      },
      padding: {
        card: 'var(--card-pad)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '200ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      zIndex: {
        sticky: '10',
        dropdown: '20',
        drawer: '30',
        dialog: '40',
        toast: '50',
        tooltip: '60',
      },
      maxWidth: {
        public: '75rem',
        app: '80rem',
        reading: '45rem',
      },
    },
  },
  plugins: [],
};

export default config;
