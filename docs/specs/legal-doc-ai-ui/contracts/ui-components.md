# UI Contracts: Component Library

This defines the breakdown of raw Stitch HTML into reusable React components.

## 1. Base Elements (`/components/ui/`)
- `Button.tsx`: Supports `variant="primary" | "ghost" | "outline"`. Primary maps to Champagne Gold `#C9A84C`.
- `RiskBadge.tsx`: `level="critical" | "moderate" | "note"`. Maps to `#8B1A1A` for critical.
- `Typography.tsx`: Reusable text abstractions ensuring Playfair Display for `variant="h1" | "h2"` and Inter for `variant="body" | "caption"`.

## 2. Layout Components (`/components/layout/`)
- `Sidebar.tsx`: The left navigation menu from the Dashboard/Profile logic.
- `Topbar.tsx`: Horizontal header with Logo and Breadcrumbs/Context titles.
- `SplitView.tsx`: Takes `leftPanel` and `rightPanel` props to handle the 55/45 (Analysis) or 25/75 (Chat) layouts seamlessly via Flexbox or CSS Grid.

## 3. High-Order Composites (`/components/features/`)
- `ContractPreview.tsx`: The visual A4 simulated document view.
- `AnalysisCard.tsx`: The card displaying a specific risk and its legal citation.
- `ChatThread.tsx`: The structured legal Q&A layout (no chat bubbles, uses formal inset blocks).
- `ClauseAccordion.tsx`: Expandable list of clauses for the editor sidebar.
