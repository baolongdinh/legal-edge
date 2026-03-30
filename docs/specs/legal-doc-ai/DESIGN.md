# Semantic Design System: LegalShield
**Project ID:** 3861173474341034275

## 1. Visual Theme & Atmosphere
**Editorial luxury meets legal precision.** LegalShield moves away from generic "AI SaaS" aesthetics (purple gradients, bouncy animations) and instead adopts the quiet, authoritative confidence of a top-tier law firm. The atmosphere is dense with information but remains airy due to rigorous typographic hierarchy and generous passing. Depth is handled through extremely subtle, diffused shadows that evoke physical paper, rather than floating web containers. Motion is limited strictly to 300ms ease-out fades.

## 2. Color Palette Recommendation & Roles
**Recommendation:** **Option A — Dark Authority**. 
*Why Option A?* In the Vietnamese legal context, trust is paramount. While red (Option C) is culturally significant (used in official state seals), it can visually signify "warnings" or "errors" in digital UI, causing fatigue. Slate and Emerald (Option B) is modern but feels more like a fintech/banking app. Deep Navy and Champagne Gold (Option A) perfectly balances supreme professional authority (Navy) with premium, exclusive advisory value (Gold), ensuring the interface feels like an expensive $50,000 professional tool.

### Color Tokens
* **Dark Authority Base** (`#0A1628`): The foundational background color. Used for all primary app backgrounds in dark mode to reduce eye strain during long contract reviews.
* **Slate Muted** (`#1E293B`): Used for elevated surfaces, sidebars, and subtle 1px structural borders.
* **Champagne Gold** (`#C9A84C`): The primary action and accent color. Used strictly for primary CTAs, active states, and highlighting crucial semantic information.
* **Warm White** (`#F5F0E8`): Primary reading text. Softer than pure white to prevent stark contrast glare against the dark navy.
* **Muted Lacquer Red** (`#8B1A1A`): Semantic color used exclusively for "Critical Risk" or "Nghiêm trọng" badges.

## 3. Typography Rules
* **Headings (Playfair Display / Cormorant Garamond):** Used exclusively for structural page titles, contract document headers, and "H1/H2" moments. Conveys an editorial, printed-document feel.
* **Body & UI Elements (Inter):** Highly legible, modern sans-serif. Used for all structural UI elements (sidebars, buttons, metadata) and dense contract body text.
* **Letter Spacing:** Headings have slightly tight tracking (`tracking-tight`) to feel bespoke, while UI text uses standard tracking.

## 4. Component Stylings
* **Buttons:** Ghost style by default with 1px solid borders. Primary buttons use Champagne Gold borders and text with a subtle background glow on hover. Shape is `rounded-sm` (slightly softened corners, avoiding the "pill" shape which feels too casual).
* **Cards/Containers:** Dark slate backgrounds with 1px `#1E293B` borders. No heavy box shadows; elevation is indicated strictly through border treatments and slight color shifts.
* **Risk Badges:** Pill-shaped (`rounded-full`) but tiny and understated. Muted semantic colors (e.g., extremely low opacity red background with solid red text).

## 5. Spacing Scale & Layout Principles
* **Base Unit:** 4px grid system (`0.25rem`).
* **Density:** High information density within components, but isolated by macro-whitespace.
* **Layouts:** Use split-screen asynchronous active areas (e.g., 55/45 splits). Left side typically handles document context, right side handles AI interaction.

## 6. Token Naming Convention
We recommend a highly semantic prefix structure for Tailwind or CSS Variables:
* `bg-surface-base` (`#0A1628`)
* `bg-surface-elevated` (`#1E293B`)
* `text-content-primary` (`#F5F0E8`)
* `border-structural-subtle` (`#1E293B`)
* `action-primary-default` (`#C9A84C`)
