# Quickstart: LegalShield Frontend UI

This guide provides steps to spin up the frontend implementation using the Stitch exported designs.

## 1. Repository Initialization
We recommend a Vite + React + TypeScript setup for extreme performance.

```bash
# Verify you are in the correct directory (or start a new Vite project)
npm create vite@latest legalshield-web -- --template react-ts
cd legalshield-web
npm install
```

## 2. Tailwind CSS Configuration
Install Tailwind and configure the specific tokens defined in our `DESIGN.md`.

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
Update `tailwind.config.js`:
```javascript
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { base: '#0A1628', elevated: '#1E293B' },
        gold: { primary: '#C9A84C' },
        slate: { muted: '#94A3B8' },
        paper: { light: '#FDF8F0', dark: '#F5F0E8' },
        risk: { critical: '#8B1A1A' }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['"Inter"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
```

## 3. Font Integration
Add the fonts to `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">
```

## 4. Porting Stitch HTML
Move the raw HTML files from `docs/designs/legal-doc-ai/html/` into React components. Use an HTML-to-JSX tool or manually convert `class=` to `className=` and decompose the large HTML files into the atomic components defined in `ui-components.md`.
