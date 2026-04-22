import typography from '@tailwindcss/typography'
import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                border: "var(--border)",
                input: "var(--input)",
                ring: "var(--ring)",
                background: "var(--background)",
                foreground: "var(--foreground)",
                lex: {
                    deep: '#0B1C1A',        // Forest Night (True Dark Green)
                    midnight: '#050D0C',    // Deeper Forest
                    ivory: '#FDFCF8',       // Bright Ivory
                    gold: '#C5A059',        // Muted Gold
                    lawyer: '#4A5D5B',      // Professional Gray
                    border: 'rgba(11, 28, 26, 0.08)',
                },
                surface: {
                    DEFAULT: '#F4F0E6',     // Warm Parchment (Page BG)
                    bright: '#FDFCF8',      // Card surfaces
                    dim: '#EDE9DE',         // Utility
                    container: {
                        lowest: '#FDFCF8',    // Highest Contrast (Cards)
                        low: '#FAF7F0',
                        DEFAULT: '#F4F0E6',
                        high: '#EBE6D9',
                        highest: '#DED9D2',
                    }
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "var(--popover)",
                    foreground: "var(--popover-foreground)",
                },
                card: {
                    DEFAULT: "var(--card)",
                    foreground: "var(--card-foreground)",
                },
                on: {
                    surface: {
                        DEFAULT: '#191c1d',
                        variant: '#444650',
                    },
                    primary: {
                        DEFAULT: '#ffffff',
                        container: '#758dd5',
                    },
                    secondary: {
                        DEFAULT: '#ffffff',
                        container: '#5a647c',
                    }
                },
                outline: {
                    DEFAULT: '#757682',
                    variant: '#c5c6d2',
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                'navy-base': '#f8f9fa',
                'navy-elevated': '#f3f4f5',
                'gold-primary': '#ffdea5',
                'gold-muted': '#5d4201',
                'paper-dark': '#191c1d',
                'slate-border': '#c5c6d2',
                'slate-muted': '#757682',
            },
            fontFamily: {
                serif: ['Merriweather', 'serif'],
                sans: ['Inter', 'sans-serif'],
                headline: ['Merriweather', 'serif'],
                body: ['Inter', 'sans-serif'],
                label: ['Inter', 'sans-serif'],
            },
            borderRadius: {
                DEFAULT: '0.5rem',
                lg: '0.5rem',
                xl: '0.75rem',
                full: '9999px',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                'slide-up': 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                'reveal': 'reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                'float': 'float 3s ease-in-out infinite',
                'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            },
            keyframes: {
                fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
                slideUp: { from: { opacity: '0', transform: 'translateY(30px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
                reveal: { from: { opacity: '0', clipPath: 'inset(10% 0 10% 0)' }, to: { opacity: '1', clipPath: 'inset(0% 0 0% 0)' } },
                float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
                scaleIn: { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
            },
        },
    },
    plugins: [
        typography,
        forms,
    ],
}
