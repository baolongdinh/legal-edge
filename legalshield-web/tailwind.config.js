/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                navy: {
                    base: '#0A1628',
                    elevated: '#1E293B',
                    hover: '#15243F',
                },
                gold: {
                    primary: '#C9A84C',
                    muted: '#A8893C',
                    light: '#E8CEA0',
                },
                paper: {
                    light: '#FDF8F0',
                    dark: '#F5F0E8',
                },
                slate: {
                    muted: '#94A3B8',
                    border: '#334155',
                },
                risk: {
                    critical: '#8B1A1A',
                    moderate: '#92400E',
                    note: '#1E3A5F',
                },
            },
            fontFamily: {
                serif: ['"Playfair Display"', 'Georgia', 'serif'],
                sans: ['"Inter"', 'system-ui', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
                slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
            },
        },
    },
    plugins: [],
}
