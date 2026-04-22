# Design System Specification

## 1. Overview & Creative North Star: "The Judicial Monolith"

This design system is built to command the digital space with the same presence as a marble-clad courthouse. Our Creative North Star, **"The Judicial Monolith,"** moves away from the "app-like" clutter of standard SaaS platforms and toward a high-end editorial experience. 

The aesthetic is defined by institutional authority and unwavering precision. We break the "template" look by utilizing intentional asymmetry—large, bold serif headings offset by generous negative space—and a layering system that favors tonal depth over structural lines. Every pixel must feel deliberate, conveying the weight of the law through sophisticated typography and a restricted, prestigious color palette.

## 2. Colors: Tonal Authority

The palette is anchored in Deep Navy and Charcoal, punctuated by a signature Bronze that signifies prestige and successful outcomes.

### Palette Strategy
- **Primary (#041627):** The foundation of the system. Used for high-level navigation and primary interactive states.
- **Surface & Containers:** We utilize the `surface_container` tokens (Lowest to Highest) to create a sense of architectural nesting.
- **Tertiary (Bronze/Gold):** The `tertiary` (#1F1300) and `tertiary_fixed_dim` (#E9C176) are reserved for "Moments of Success," high-value CTAs, or professional milestones. Use these sparingly to maintain their impact.

### The "No-Line" Rule
To achieve a premium editorial feel, **1px solid borders are prohibited for sectioning.** Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` sidebar should sit directly against a `surface` main content area. The distinction is felt through the color transition, not a "drawn" line.

### Glass & Gradient Transitions
For primary CTAs and Hero sections, use subtle linear gradients transitioning from `primary` to `primary_container`. This adds a "visual soul"—a slight metallic sheen—that prevents the UI from feeling flat or generic. For floating elements (like persistent navigation), apply a backdrop-blur (12px-20px) using a semi-transparent `surface` color to create a "frosted glass" effect.

## 3. Typography: The Tension of Tradition and Tech

The system creates a "dialogue" between two distinct typefaces to convey a brand that is both historically grounded and technologically advanced.

- **Display & Headlines (Newsreader):** This sophisticated Serif is our "Voice of Authority." It should be used for large titles and editorial headers. The high contrast of the letterforms suggests the tradition of legal briefs and historical ledgers.
- **UI & Body (Inter):** This clean Sans-serif is our "Voice of Precision." Used for all functional UI elements, body copy, and labels. It ensures maximum readability and a modern, efficient feel for data-heavy tasks.

**Typography Hierarchy:**
- **Display-LG (3.5rem):** Reserved for hero titles.
- **Headline-MD (1.75rem):** For major section titles, always in Newsreader.
- **Body-MD (0.875rem):** The workhorse for all legal text and descriptions, set in Inter for clarity.

## 4. Elevation & Depth: Tonal Layering

We reject traditional drop-shadows in favor of **Tonal Layering**. Depth is achieved by "stacking" surfaces to mimic the physical layering of fine paper or legal documents.

- **The Layering Principle:** Place a `surface_container_lowest` card on top of a `surface_container_low` section. This creates a soft, natural lift that feels integrated into the environment.
- **Ambient Shadows:** When a component *must* float (e.g., a Modal or Menu), use an extra-diffused shadow (Blur: 32px, Y: 16px) at a maximum of 6% opacity. The shadow color should be a tinted version of `on_surface` to mimic natural ambient light.
- **The "Ghost Border" Fallback:** If a border is required for accessibility (such as in input fields), use the `outline_variant` token at 20% opacity. Never use 100% opaque borders.

## 5. Components: Precision Primitives

### Buttons
- **Primary:** `primary` background with `on_primary` text. Use the `DEFAULT` (0.25rem) roundedness for a sharp, architectural corner.
- **Tertiary (Signature):** Used for "Commit" or "Finalize" actions. Background: `tertiary_fixed_dim`, Text: `on_tertiary_fixed`.

### Cards & Lists
**Forbid the use of divider lines.** Separate list items and card sections using the Spacing Scale (Vertical White Space) or subtle background shifts. A card should be a `surface_container_high` block on a `surface` background.

### Input Fields
- **Resting:** `surface_container_highest` background with a subtle "Ghost Border."
- **Focus:** Transition the border to `primary` and increase the background contrast. Helper text must be `on_surface_variant` in `label-sm` (Inter).

### Chips & Tags
Used for case status or legal categories. Use `secondary_container` with `on_secondary_container` text. These should be `full` roundedness to contrast against the sharp-edged buttons and containers.

### The Ledger (Custom Component)
A high-density data list designed for case files. It uses alternating background shifts between `surface` and `surface_container_low` instead of borders to guide the eye across the row.

## 6. Do’s and Don’ts

### Do
- **Do** lean into intentional asymmetry. Offset your headers to the left and leave large right-hand gutters for "breathing room."
- **Do** use the Bronze `tertiary` tones for "High-End" interactions—closing a case, signing a document, or viewing a summary.
- **Do** prioritize high contrast (Inter on `surface`) for all legal documentation.

### Don't
- **Don't** use standard 1px borders to separate content. It cheapens the "Monolith" aesthetic.
- **Don't** use "bubbly" or highly rounded corners (avoid `xl` and `full` except for Chips). Stick to `DEFAULT` (0.25rem) for a more serious, legal tone.
- **Don't** use pure black shadows. They create "muddy" UI. Always tint your shadows with the primary navy or surface grey.