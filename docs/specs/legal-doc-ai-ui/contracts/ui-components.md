# UI Design System: Premium Legal AI

LegalEdge utilizes a **"Midnight Gold"** aesthetic — a high-contrast, premium interface designed for professional legal environments.

## Design Principles
- **Atmosphere**: Dark Mode by default (`#0A1628`). Use Glassmorphism (`backdrop-blur`) and thin borders (`0.5px`).
- **Typography**: Playfair Display for headings (Authority/Trust), Inter for interface text (Precision).
- **Accents**: Champagne Gold (`#C9A84C`) for primary CTAs and critical highlights.
- **Motion**: Subtle micro-animations (0.2s duration) for interaction feedback. No generic pop-ups.

## 1. Core Foundations (`/components/ui/`)

### [NEW] `Dialog.tsx` (Overlay)
Custom portal-based modal replacing `window.confirm`. 
- **Style**: Centered, `backdrop-blur-md`, nested within a `Framer Motion` AnimatePresence.
- **Variants**: `danger` (red accents for deletion), `info` (gold accents).

### [NEW] `Toast.tsx` / `Notification.tsx`
Floating notification system replacing `window.alert`.
- **Placement**: Bottom-right or Top-center. 
- **Logic**: Auto-dismiss after 4s. Slide-in-out animations.

### [MODIFY] `Button.tsx`
- **Hover**: Subtle vertical lift (`-2px`) and outer glow (`shadow-gold`).
- **Loading**: Pulse animation on the gold background, not a generic spinner.

## 2. Structural Patterns (`/components/layout/`)

### `SplitView.tsx`
Handles the core "Review & Chat" layout.
- **Left**: Document view (White/Paper aesthetic for readability).
- **Right**: Dark AI Panel (Console-style, code-like precision).

## 3. Interaction Polish

- **Page Transitions**: Smooth fade-in + slide-up on route change.
- **Skeleton Loaders**: Shimmering dark blocks matching the background, used during AI inference/embedding.
- **Card States**: Hovering over dashboard contracts triggers a scale transform and border-glow transition.

