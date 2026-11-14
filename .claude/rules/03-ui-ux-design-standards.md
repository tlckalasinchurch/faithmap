# FaithMap UI/UX Design Standards & Impeccable Heuristics

FaithMap serves church leaders in Kalasin, including elderly and non-technical members.

## 1. Core Visual Principles
- **Modern Minimal & Premium Quality:** Clean layouts, generous whitespace, high contrast, intentional typography.
- **Mobile-First Responsive:** Every view must function flawlessly on mobile screens (LINE LIFF viewport: 360px–420px width).
- **Large Touch Targets:** Minimum 48×48px clickable area for buttons, checkboxes, dropdowns, and toggles.
- **Readable Thai Typography:** Minimum 16px body text, 18px–20px form labels, high contrast ratios (WCAG AAA for text).

## 2. Anti-AI-Slop Prohibition
- ❌ NO generic purple SaaS gradients.
- ❌ NO nested cards inside cards without functional necessity.
- ❌ NO decorative glassmorphism or distracting animated effects.
- ❌ NO ambiguous iconography without clear Thai text labels.
- ❌ NO technical error messages shown to users (e.g. "ERR_500_DB_FAIL"). Use clear Thai guidance.

## 3. Verification Protocol
Before marking any UI task complete:
1. Verify layout across 360px, 768px, and 1280px widths.
2. Run `npx impeccable detect` on modified components.
3. Validate keyboard accessibility and focus indicators.
