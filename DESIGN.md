# Design System: Cognify NOAH — Retro Blueprint

## 1. Visual Theme & Atmosphere
A neobrutalist-retro exam terminal: heavy black display type stamped onto warm parchment ruled like graph paper, one
restrained burnt-orange signal that only ever marks what is *live* (the active view, keyboard focus, NOAH listening or
speaking, exam progress), and the same asymmetric, no-overlap layout as before — the particle intelligence lives in a
framed panel beside the copy, never behind or under it. Everything but the canvas and the two typefaces is unchanged
from the system's original "Quiet Examiner" pass: same components, same spacing, same layout rules.

- **Density:** 4 — "Daily App Balanced". Generous gutters on the landing and portal; the admin dashboard tightens to ruled rows.
- **Variance:** 7 — offset two-column splits, ruled lists instead of card grids.
- **Motion:** 6 — spring-physics reveals and quiet ambient loops; nothing decorative.

## 2. Color Palette & Roles
Warm parchment neutrals with a single accent. Light theme only.

- **Canvas Parchment** (#F4EEE1) — page background: a two-tier ruled grid in ink at low opacity (a fine 16px sheet
  under a bolder 96px sheet), fixed to the viewport, reading as graph paper / blueprint rather than flat CSS white.
  Static — no gradient blur, nothing animates.
- **Pure Surface** (#FFFFFF) — panels, modal, dropdowns
- **Sunken Wash** (#F4F4F5) — inputs, transcript well, table hover
- **Charcoal Ink** (#18181B) — primary text, primary button fill (Zinc-900 depth, never pure black)
- **Muted Steel** (#71717A) — secondary text, labels, metadata (4.6:1 on canvas)
- **Whisper Line** (#E4E4E7) — 1px structural borders and dividers
- **Strong Line** (#D4D4D8) — outline-button borders, dashed drop zone
- **Signal Orange** (#C8501B) — the single accent; focus rings, active nav bar, live indicators, progress. Saturation 76%.
- **Signal Wash** (#FBEEE7) — soft fill behind accent text (the NOAH AI tag)
- **Status only:** Verdict Green (#2F7D4F / wash #E8F3EC) and Alert Red (#B4372E / wash #F9E9E7) mark pass/fail results
  and are semantic, never decorative.

## 3. Typography Rules
- **Two families.** Display: **Archivo Black** — a single heavy-weight cut (no lighter variant exists to fall back to),
  used only for `h1`/`h2`/`h3`/`h4` that aren't also `.eyebrow` labels, so headline punch comes from the typeface
  itself, not from `font-weight`. Body/UI/mono: **Space Mono**, regular weight only, everywhere else — buttons, labels,
  inputs, tables, numbers. Hierarchy in body text still comes from size, case, tracking and color, never weight.
- **Display (NOAH):** `clamp(4.5rem, 13vw, 7rem)`, tracking normal, uppercase — capped low enough to clear the
  particle panel in the two-column landing split (see §5); the split itself starts at `lg` (1024px), not `md`, because
  below that the column is too narrow for "NOAH" at any size in this typeface.
- **Headings:** `clamp(1.5rem, 3vw, 2rem)` for page titles, `1.125rem` for section titles — same sizes as before, new
  typeface.
- **Body:** `0.9375rem` (15px), line-height 1.65, letter-spacing `0.02em`, `max-width: 65ch` for prose.
- **Micro labels:** `0.6875rem`, uppercase, tracking `0.14em`, Muted Steel — stays in Space Mono even inside an `h3`
  (that's what the `.eyebrow` exclusion on the display-font rule is for).
- **Numbers** (scores, KPIs, dates) use `tabular-nums` so columns align; Space Mono's digits read like a retro
  calculator/terminal, which suits the theme.
- **Banned:** Inter, generic serifs, a second display typeface, bold/black `font-weight` values (the one heavy cut is
  Archivo Black's own design, not a CSS weight toggle).

## 4. Component Stylings
* **Buttons:** Pills, 44px minimum height. Primary = Charcoal Ink fill with paper text; secondary = Strong Line outline that
  darkens on hover. Tactile: 1px push-down and 0.985 scale on press. No glows, no gradients.
* **Panels:** Pure Surface, 1px Whisper Line, generous 1.25–2rem radius, shadows only on floating layers (modal, widget) and
  tinted zinc, never black. Lists and tables are ruled rows with border-top dividers, not stacks of cards.
* **Inputs:** Label above, Sunken Wash fill, 0.75rem radius, 2px Signal Orange focus ring with 2px offset. Errors below the field.
* **Status badges:** Small pills — green wash for Pass, red wash for Needs Review, Sunken for neutral.
* **Loading / progress:** Exam progress is a full-width 2px hairline that fills with Signal Orange via `scaleX`.
* **Empty states:** A composed, dashed-border panel that says what to do next — never bare "No data".

## 5. Layout Principles
- Contained max-widths: 72rem for the portal, 80rem for the dashboard, centered.
- **Landing:** two-column asymmetric split (copy 5fr / particle panel 7fr), stacked on mobile with the panel below the copy.
- **Student portal:** papers (7fr) beside history (5fr). **Dashboard:** KPI strip with vertical dividers, then ruled tables
  inside `overflow-x-auto` wrappers so the page body never scrolls sideways.
- **Exam kiosk:** particle panel (5fr) beside the question and controls (6fr); stacked on mobile.
- Full-height sections use `min-h-[100dvh]` arithmetic, never `h-screen`. No overlapping elements anywhere.
- Below `lg` (1024px) every split collapses to a single column; every touch target is at least 44px.

## 6. Motion & Interaction
- Spring physics by default (`stiffness: 100, damping: 20`) for reveals; no linear easing.
- Content mounts as a staggered cascade (60ms steps) on view change and after list renders.
- Ambient loops: the status square pulses; the widget beacon pings; the particle core reacts to idle / listening / speaking.
- Only `transform` and `opacity` are animated. `prefers-reduced-motion` collapses reveals and the swarm to static.

## 7. Anti-Patterns (Banned)
- No emojis, no icons placed in front of text labels (icon-only controls are fine and always carry an `aria-label`).
- No Inter, no serif, no bold weights.
- No pure black (#000000), no neon or outer-glow shadows, no gradient fills, no second accent color.
- No overlapping elements; particles never sit behind text.
- No three-equal-cards rows; no centered hero; no more than one primary CTA per screen.
- No filler UI copy ("Scroll to explore", bouncing chevrons) and no AI-cliché marketing words.
- No unpinned third-party scripts.
