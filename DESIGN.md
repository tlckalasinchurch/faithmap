---
name: FaithMap Studio
description: Kinetic Pop Bento & Neo-Brutalist Tactile design system for the Kalasin House Mission Network
colors:
  acid-lime: "#c8ff00"
  acid-lime-hover: "#b4eb00"
  cobalt-pop: "#1d4ed8"
  cobalt-soft: "#dbeafe"
  punch-coral: "#be123c"
  coral-soft: "#ffe4e6"
  solar-amber: "#ffb703"
  amber-soft: "#fef3c7"
  field-emerald: "#047857"
  emerald-soft: "#d1fae5"
  studio-canvas: "#f0f4f8"
  card-paper: "#ffffff"
  slate-tint: "#e2e8f0"
  carbon-ink: "#141413"
  zinc-ink: "#27272a"
  muted-ink: "#3f3f46"
typography:
  display:
    fontFamily: "Kanit, Noto Sans Thai, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Kanit, Noto Sans Thai, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Kanit, Noto Sans Thai, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Noto Sans Thai, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.65
  label:
    fontFamily: "Noto Sans Thai, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "14px"
  lg: "20px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.acid-lime}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.acid-lime-hover}"
    textColor: "{colors.carbon-ink}"
  button-secondary:
    backgroundColor: "{colors.cobalt-pop}"
    textColor: "{colors.card-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.punch-coral}"
    textColor: "{colors.card-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "48px"
  button-paper:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "48px"
  button-paper-hover:
    backgroundColor: "{colors.slate-tint}"
    textColor: "{colors.carbon-ink}"
  input-field:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "48px"
  card-bento:
    backgroundColor: "{colors.card-paper}"
    textColor: "{colors.carbon-ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-bento-ink:
    backgroundColor: "{colors.carbon-ink}"
    textColor: "{colors.studio-canvas}"
    rounded: "{rounded.lg}"
    padding: "28px"
  sticker-badge:
    backgroundColor: "{colors.acid-lime}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: FaithMap Studio

## Overview

**Creative North Star: "The Tactile Mission Club Studio"**

FaithMap Studio treats provincial house-mission coordination across Kalasin's 18 districts as an energetic, celebration-worthy creator club deck rather than bureaucratic church paperwork. Built for Gen Z and Gen Alpha youth leaders alongside veteran pastors and care coordinators, the interface pairs a crisp dot-grid Cool Studio Ice canvas with physical Bento cards framed in bold carbon-ink borders and offset hard shadows that depress under the thumb.

Every screen prioritizes sub-3-minute mobile reporting after evening house fellowships and instant situational clarity during the Sunday 20:30 provincial leadership huddle. It explicitly rejects clinical hospital-teal dashboards, washed-out corporate ERP tables, and cramped spreadsheet forms in favor of high-contrast colour-coded Bento modules, live progress meters, and unmistakable sticker status pills.

**Key Characteristics:**
- Tactile Neo-Brutalist Bento architecture with 2px solid #141413 structural ink borders and physical 4px 4px 0px #141413 hard offset shadows
- High-energy Electric Acid Lime (#c8ff00) primary action surfaces paired strictly with dark Carbon Ink (#141413) typography
- Mobile-first 48px minimum touch targets (min-height: 48px) across buttons, selects, navigation pills, and form controls
- Generous Thai script legibility (1rem base body size, 1.65 line-height) that protects Thai vowels and tone marks from vertical clipping
- Tabular monospace counters (JetBrains Mono with tabular-nums) for all mission KPIs, attendance ratios, and district breakdowns

## Colors

The palette balances a cool, high-craft studio drafting canvas with punchy, sticker-grade semantic accents that communicate report status at a glance while maintaining WCAG AA contrast.

### Primary
- **Electric Acid Lime** (`#c8ff00`): Primary action plates, active navigation pills, mission pulse progress bars, approved status stickers, and text selection highlights (`::selection`). Always paired with Carbon Ink (`#141413`) text.
- **Pressed Acid Lime** (`#b4eb00`): Hover state for primary Acid Lime action buttons (`.fm-btn-lime:hover`).

### Secondary
- **Cobalt Pop** (`#1d4ed8`): Secondary action buttons (`.fm-btn-violet`), focus-visible rings (`3px solid #1d4ed8`), under-review status badges, and offset shadow accent (`4px 4px 0px #1d4ed8`) under dark ink hero panels.
- **Cobalt Wash** (`#dbeafe`): Unread notification rows, attendance KPI Bento cell backgrounds, and submitted-awaiting-review status pills.

### Tertiary
- **Punch Coral** (`#be123c`): Blocked-report escalation alerts (`CD-07`), destructive/unlock CTAs (`.fm-btn-coral`), and confidential pastoral care urgent flags.
- **Rose Alert Wash** (`#ffe4e6`): Surface tint for blocked escalation banners, error alert panels, and late-submission (`ส่งหลัง 20:00 น.`) warning stickers.
- **Solar Amber** (`#ffb703`): Mission streak stickers, needs-revision status badges, and open follow-up counters on dark ink panels.
- **Amber Wash** (`#fef3c7`): Pending/missing report KPI cells and caution banners.
- **Field Emerald** (`#047857`): Approved report counts in body breakdown tables and verified milestone indicators.
- **Emerald Wash** (`#d1fae5`): Soft confirmation surfaces and completed discipleship milestone tags.

### Neutral
- **Cool Studio Ice** (`#f0f4f8`): Root viewport background canvas (`--fm-canvas`), radially patterned with `#cbd5e1` dots (`1.25px` radius on a `24px` grid), and light text on dark ink panels.
- **Crisp Card Paper** (`#ffffff`): Default Bento panel (`.fm-panel`), data table row, and input control background (`--fm-paper`).
- **Slate Divider Tint** (`#e2e8f0`): Table header bars, card sub-headers, draft status badges, and paper button hover states (`--fm-paper-tint`).
- **Carbon Ink** (`#141413`): Primary body and display typography, all `2px` structural borders, and hard offset drop shadows (`--fm-ink`).
- **Zinc Studio Ink** (`#27272a`): Secondary metadata copy, dark-mode control fills inside the sticky command header, and internal dividers on dark ink panels (`--fm-ink-secondary`).
- **Muted Slate Ink** (`#3f3f46`): Input placeholder text and de-emphasized helper labels (`--fm-ink-muted`).

### Named Rules
**The Ink-On-Lime Rule.** Electric Acid Lime (#c8ff00) and Solar Amber (#ffb703) surfaces must exclusively carry Carbon Ink (#141413) text and icons—never white text—to preserve razor-sharp WCAG AA contrast under mobile glare.

**The Semantic Wash Rule.** Soft semantic washes (#dbeafe, #ffe4e6, #fef3c7, #d1fae5) fill KPI cells, alert banners, and status pills to encode workflow state through surface tone, but every washed surface remains enclosed by a 2px solid #141413 border.

## Typography

**Display Font:** `Kanit` (weights `600`, `700`, `800`, with `Noto Sans Thai` and `sans-serif` fallbacks)
**Body Font:** `Noto Sans Thai` (weights `400`, `500`, `600`, `700`, with `system-ui, -apple-system, sans-serif` fallbacks)
**Label/Mono Font:** `JetBrains Mono` (weights `500`, `700`, `monospace` fallback) for numeric KPIs, timestamps, body codes, and GPS masks

**Character:** Geometric, confident Thai display headlines in `Kanit` bring modern club-poster authority, while `Noto Sans Thai` at generous line-height keeps multi-tiered Thai vowels and tone marks effortless to scan on small screens, anchored by `JetBrains Mono` for tabular numeric precision.

### Hierarchy
- **Display** (`800`, `1.875rem`–`2.25rem` / `30px`–`36px`, line-height `1.15`, letter-spacing `-0.02em`): Hero Bento pulse titles (`h1`) such as the weekly provincial mission rhythm header.
- **Headline** (`800`, `1.25rem`–`1.5rem` / `20px`–`24px`, line-height `1.25`, letter-spacing `-0.02em`): Section card headers (`h2`), drawer titles, and escalation banner headings.
- **Title** (`800`, `1.125rem` / `18px`, line-height `1.35`, letter-spacing `-0.02em`): KPI cell titles, modal subheads, and house group row titles.
- **Body** (`500`–`700`, `1rem` / `16px`, line-height `1.65`): Primary Thai interface copy, form input text, table cells, and pastoral care notes.
- **Label** (`700`–`800`, `0.75rem`–`0.875rem` / `12px`–`14px`, line-height `1.4`): Status sticker pills (`.fm-sticker`), role badges, and table column headers.
- **Mono Counter** (`700`–`800`, `0.875rem`–`2.25rem` / `14px`–`36px`, `font-variant-numeric: tabular-nums`): Big KPI ratios (`submitted/expected`), attendance tallies, `A1`–`A3` counters, and masked coordinate strings.

### Named Rules
**The Thai Tone-Mark Clearance Rule.** Body copy never drops below 16px (1rem) and maintains 1.65 line-height so stacked Thai upper vowels (ิ ี ึ ื) and tone marks (่ ้ ๊ ๋) never collide or clip inside buttons, inputs, or table rows.

**The Tabular Counter Rule.** Every numeric KPI, ratio, attendance count, and timestamp uses JetBrains Mono with tabular-nums so columns and live progress counters align vertically without horizontal jitter.

## Layout

FaithMap uses a responsive asymmetric Bento deck inside a centered `1280px` (`max-w-7xl`) studio container with `16px` (`px-4`) horizontal padding and `24px` (`py-6`, `gap-6`) vertical rhythm between deck rows.

- **Top Studio Command Header & Dock:** A sticky two-tier `z-30` carbon-ink header (`#141413`). The upper bar houses the FaithMap brand plate, period pill, demo role switcher, notification drawer trigger, and logout button. The lower dock (`#18181b`) provides a horizontally scrollable 7-mode kinetic navigation strip (`gap-2`, `py-2.5`) that stays thumb-reachable on mobile without collapsing into a hidden hamburger menu.
- **12-Column Asymmetric Bento Grid:** At `lg` (`1024px+`), primary workspace views split into a `12`-column CSS Grid (`lg:grid-cols-12`, `gap-6`) pairing a `7`-column primary hero or ledger panel (`lg:col-span-7`) with a `5`-column 2x2 KPI matrix or live group feed (`lg:col-span-5`).
- **Internal Matrix Sub-Grids:** Multi-cell KPI matrices use flush internal `2px solid #141413` dividers (`divide-y-2` and `sm:border-r-2`) inside an `overflow-hidden` Bento shell so adjacent colour-washed cells read as a unified physical instrument cluster.
- **Touch & Density Ergonomics:** All interactive controls enforce a `48px` minimum height (`min-h-[48px]`) with `16px`–`28px` (`p-4` to `p-7`) card padding. Data tables wrap in `overflow-x-auto` containers with a `580px` minimum width to preserve tabular readability on narrow handsets.

## Elevation & Depth

FaithMap rejects blurry Gaussian drop shadows, glassmorphism, and translucent gradients in favor of **Neo-Brutalist physical offset elevation**. Depth is communicated through solid, zero-blur `2px` ink borders paired with hard `45°` offset shadow plates that translate on hover and collapse flat into the canvas when pressed.

### Shadow Vocabulary
- **Panel Elevation** (`box-shadow: 4px 4px 0px #141413`): Standard resting elevation for all white and semantic-washed `.fm-panel` Bento cards.
- **Hero Ink Elevation** (`box-shadow: 4px 4px 0px #1d4ed8`): Cobalt Pop offset shadow beneath dark Carbon Ink hero panels (`.fm-panel-ink`) to separate dark cards from the light dot-grid canvas.
- **Interactive Control Elevation** (`box-shadow: 2px 2px 0px #141413`): Resting shadow for `.fm-btn` buttons and `.fm-sticker` status pills; lifts to `4px 4px 0px #141413` with `translate(-1px, -1px)` on hover and collapses to `0px 0px 0px #141413` with `translate(2px, 2px)` on `:active`.
- **Active Nav Pill Elevation** (`box-shadow: 3px 3px 0px #1d4ed8`): Cobalt offset shadow under the active Acid Lime tab in the dark navigation dock.
- **Prominent Modal Elevation** (`box-shadow: 6px 6px 0px #141413`): Reserved token (`--fm-shadow-lg`) for high-priority floating callouts.
- **Input Bevel** (`box-shadow: inset 0 1px 0 rgba(20, 20, 19, 0.06)`): Subtle inner top crease inside `.fm-input` fields to distinguish recessed text entry from raised buttons.

### Named Rules
**The Zero-Blur Shadow Rule.** Every drop shadow in the system uses 0px blur radius and 0px spread with a solid hex color (#141413 or #1d4ed8); feathered or translucent shadows are prohibited.

**The Tactile Depression Rule.** Every pressable button (.fm-btn) must physically respond to pointer states using a 140ms cubic-bezier(0.22, 1, 0.36, 1) transition: lifting (-1px, -1px) to a 4px shadow on hover and depressing (2px, 2px) to a 0px shadow on active press.

## Shapes

The form language pairs generous, friendly outer card contours with crisp `2px solid #141413` ink outlines and pill-shaped status stickers.

- **Bento Panels (`.fm-panel`, `.fm-panel-ink`):** Large `20px` (`1.25rem`) border radius with `2px solid #141413` borders. When panels contain internal sub-grids or table headers, `overflow: hidden` clips child backgrounds cleanly to the `20px` contour.
- **Buttons & Inputs (`.fm-btn`, `.fm-input`):** Medium `14px` (`0.875rem`) border radius with `2px solid #141413` borders, nesting harmoniously inside `20px` Bento cards.
- **Header Controls & Nav Pills:** `12px` (`0.75rem` / `rounded-xl`) border radius for top-bar role selectors, icon buttons, and 7-mode dock tabs.
- **Sticker Badges (`.fm-sticker`) & Progress Bars:** Full pill silhouette (`9999px` / `rounded-full`) with `2px solid #141413` borders (`#f0f4f8` border on dark hero progress tracks).
- **Code & Group Tags:** Compact `6px` (`0.375rem` / `rounded-md`) radius with `1px solid #141413` borders for inline monospace body codes (e.g., `B-KLS-01`).

## Components

Every component feels like a physical, vinyl-bordered studio control plate—bold, high-contrast, and immediately responsive to touch.

### Buttons
- **Shape:** Medium rounded rectangle (`14px` / `0.875rem` radius) with `2px solid #141413` border, `48px` minimum height, `10px 18px` (`0.625rem 1.125rem`) padding, `8px` (`0.5rem`) icon-to-label gap, and `700` font weight.
- **Primary (`.fm-btn-lime`):** Electric Acid Lime (`#c8ff00`) background with Carbon Ink (`#141413`) text and `2px 2px 0px #141413` shadow; shifts to `#b4eb00` on hover.
- **Hover / Focus:** Hover lifts button `translate(-1px, -1px)` and expands shadow to `4px 4px 0px #141413`; active press translates `(2px, 2px)` and zeroes shadow; `:focus-visible` renders a `3px solid #1d4ed8` outline with `2px` offset.
- **Secondary / Danger / Paper:**
  - **Cobalt Secondary (`.fm-btn-violet`):** Cobalt Pop (`#1d4ed8`) background with white (`#ffffff`) text; hovers to `#1e40af`.
  - **Coral Danger (`.fm-btn-coral`):** Punch Coral (`#be123c`) background with white (`#ffffff`) text for blocked-report escalations and destructive actions; hovers to `#9f1239`.
  - **Paper Neutral (`.fm-btn-paper`):** Crisp Card Paper (`#ffffff`) background with Carbon Ink (`#141413`) text for CSV exports and secondary tools; hovers to Slate Divider Tint (`#e2e8f0`).

### Chips
- **Style (`.fm-sticker`):** Pill silhouette (`9999px` radius), `2px solid #141413` border, `4px 12px` (`0.25rem 0.75rem`) padding, `14px` (`0.875rem`) bold (`700`) text, `6px` (`0.375rem`) icon gap, and `2px 2px 0px #141413` hard shadow.
- **State (`StatusBadge`):** Semantic fills map directly to workflow states:
  - `approved` (`อนุมัติแล้ว`): `#c8ff00` bg, `#141413` text
  - `submitted` (`ส่งแล้ว · รอตรวจ`): `#dbeafe` bg, `#141413` text
  - `under_review` (`ผ่านตรวจทาน · รออนุมัติ`): `#1d4ed8` bg, `#ffffff` text
  - `needs_revision` (`ส่งกลับขอแก้ไข`): `#ffb703` bg, `#141413` text
  - `draft` (`ฉบับร่างส่วนตัว`): `#e2e8f0` bg, `#141413` text
  - `not_submitted` (`ยังไม่ส่งรายงาน`): `#ffffff` bg, `#141413` text
  - `blocked` (`ติดขัด (Blocked)`): `#be123c` bg, `#ffffff` text
  - Late flag (`ส่งหลัง 20:00 น.`): sibling pill in `#ffe4e6` bg with `#881337` text

### Cards / Containers
- **Corner Style:** `20px` (`1.25rem`) border radius.
- **Background:** Crisp Card Paper (`#ffffff`) for `.fm-panel`; Carbon Ink (`#141413`) with `#f0f4f8` text for `.fm-panel-ink`; semantic washes (`#ffe4e6`, `#fef3c7`, `#dbeafe`, `#c8ff00`) for KPI sub-cells and alert banners.
- **Shadow Strategy:** `4px 4px 0px #141413` on `.fm-panel`; `4px 4px 0px #1d4ed8` on `.fm-panel-ink`.
- **Border:** `2px solid #141413` outer perimeter and `2px solid #141413` internal section headers (`border-b-2`) and table row dividers (`divide-y-2`).
- **Internal Padding:** `20px` (`p-5`) to `28px` (`sm:p-7`) for hero and alert panels; `16px 24px` (`px-6 py-4`) for card header bars and list rows.

### Inputs / Fields
- **Style (`.fm-input`):** `48px` minimum height, `14px` (`0.875rem`) radius, `2px solid #141413` border, `#ffffff` background, `#141413` text (`16px`, weight `500`), `10px 14px` (`0.625rem 0.875rem`) padding, and `inset 0 1px 0 rgba(20, 20, 19, 0.06)` inner top shadow. Placeholder text uses `#3f3f46`.
- **Focus:** `3px solid #1d4ed8` outline with `2px` offset (`:focus-visible`), paired with `#1d4ed8` text caret.
- **Error / Disabled:** Disabled controls reduce opacity to `0.55` with `cursor: not-allowed`.

### Navigation
- **Studio Command Header & 7-Mode Kinetic Dock:** Sticky top header (`#141413`, `border-b-2 border-[#141413]`) paired with a secondary `#18181b` navigation bar (`border-t border-[#27272a]`). Navigation items are horizontal pill buttons (`min-h-[48px]`, `rounded-xl`, `px-4 py-2`, `16px` font-extrabold) with a `20px` Lucide icon and non-wrapping Thai label. Default tabs use `#27272a` background and border with `#f0f4f8` text and `hover:border-[#c8ff00]`. The active tab switches to Electric Acid Lime (`#c8ff00`) background, `#141413` border and text, and a `3px 3px 0px #1d4ed8` Cobalt offset shadow.

### Live Mission Rhythm Bar (Signature Component)
- **Hero Progress & Pulse Cluster:** Embedded inside the dark `.fm-panel-ink` hero card on the Dashboard, framed by `2px solid #27272a` top and bottom borders (`py-4`). Pairs a full-width pill progress track (`h-5`, `rounded-full`, `2px solid #f0f4f8` border, `#27272a` fill, `2px` inner padding) containing an animated `#c8ff00` fill bar (`min-width: 8%`, `transition-all duration-300`) with a 3-column `tabular-nums` monospace stat strip (`activeBodies` in `#c8ff00`, `heldMeetings` in `#f0f4f8`, and `openFollowUps` in `#ffb703`) divided by `1px solid #27272a` vertical rules.

## Do's and Don'ts

### Do:
- **Do** frame every Bento card, button, input, and status sticker with a 2px solid #141413 structural border and pair it with its designated zero-blur offset shadow (2px, 3px, or 4px).
- **Do** maintain a minimum 48px touch target height (min-h-[48px]) on all interactive controls and >= 16px (1rem) body text with 1.65 line-height for Thai script legibility.
- **Do** pair Electric Acid Lime (#c8ff00) and Solar Amber (#ffb703) backgrounds exclusively with Carbon Ink (#141413) text and icons.
- **Do** apply font-mono (JetBrains Mono) and tabular-nums to all numeric KPIs, submission ratios, attendance counts, and timestamps.
- **Do** keep the 24px radial dot-grid background (#cbd5e1 dots on #f0f4f8) visible around Bento cards so the workspace retains its tactile studio drafting board feel.

### Don't:
- **Don't** use blurred Gaussian drop shadows (box-shadow with blur > 0), glassmorphic backdrop-filter blurs, or soft gradient card fills anywhere in the interface.
- **Don't** place white (#ffffff or #f0f4f8) text on Electric Acid Lime (#c8ff00) or Solar Amber (#ffb703) surfaces.
- **Don't** introduce clinical hospital-teal palettes, borderless corporate ERP tables, or sub-16px body copy that crowds Thai vowels and tone marks.
- **Don't** add uppercase tracking-wide kicker or eyebrow labels above card headings; lead directly with the bold Kanit heading and pair status metadata as a .fm-sticker pill.
