# maßklar. v2 — built by Muse from the reel lessons

Built 2026-11-06 from the user's own v1 files (`index-v1.html`, `styles-v1.css`,
`app-v1.js` = his `app-2.js` — kept alongside for reference). His working copy in
`~/workspace/user/files/` was NOT touched. To use v2, copy `index.html`,
`styles.css`, `app.js` over his three files (rename `app-2.js` out of the way first —
`index.html` loads `app.js`).

## What the reels changed

### Charles Liu — "Day 2 of Removing AI Slop" (7 steps)
1. **No purple gradients** — none were there, none added. The only wash is a faint
   lime/green tint behind the hero visual.
2. **Auto-submit** — the result now updates **live while typing**. The button stays
   as an explicit confirmation (keyboard / screen-reader users), it is no longer
   required.
3. **Cut extra words** — hero, section intro and aside copy shortened.
4. **Lose tile borders** — the example cards have no borders or dividers any more,
   just gap + soft shadow.
5. **Iridescent background + better contrast** — subtle lime/green wash in the hero;
   secondary text darkened (`#718079` → `#5a6a62`) so small text is actually readable.
6. **Animate typing, visual feedback per state** — inputs get a green ring when valid,
   red ring + friendly message when invalid; the result panel flashes softly on change.
7. **Autofill** — no SMS here, so the equivalent: tapping Wanderkarte / Grundriss /
   Modellbau H0 **fills the calculator** (1 cm, 1:25.000 / 1:100 / 1:87) and jumps to it.
   In v1 those links did nothing but scroll.

### Lincoln Devine — "15 tells your app was vibe coded"
- **Buttons too small** — calculate button 43 → **48px**, copy/reset min **44px**,
  segmented buttons 44px, FAQ rows 48px.
- **Text too small** — labels 10–11 → 12px, result context 10 → 12px, meta 9 → 11px,
  errors 11 → 13px, footer 10 → 12px.
- **Too much padding** — header 78 → 64px, hero/section padding tightened.
- **Keyboard covers input** — focused field scrolls into view on mobile.
- **Double-submit** — submits within 250 ms are ignored; live calc makes it harmless anyway.
- **Blank screen for new user** — result pre-filled on load (1 km), plus a `<noscript>`
  fallback line with the worked example.
- **Raw error text** — "Die Länge auf dem Plan braucht eine Zahl größer als 0.
  Bitte prüfe die Eingabe." instead of a raw validation message, with the bad field
  marked red.
- **No tap animations** — buttons/cards scale to .98 on press, hover lift on cards.
- **User prefs wiped** — last target, values and units persist in `localStorage`
  (`massklar_v1`) and restore on load. Reset clears them.
- **No spinners, no emojis, no purple gradients, light-only by design**
  (`color-scheme: light` — no half-broken dark mode).

### Niki Aroca — one accent colour
Kept exactly: paper + green base, **orange as the single accent**. No new colours added.
Lime stays only as a highlight on green, as in v1.

### @ui_motion_prompts — motion patterns (calm versions only)
- **Travelling tab indicator** — the mode dropdown is now a 3-way segmented control
  (Reale Länge / Zeichnungslänge / Maßstabszahl) with a sliding pill.
- **Staggered entry** — example cards fade in one after another.
- **Fill-then-confirm** — the copy button fills green and shows "Kopiert ✓".
- **Merged alerts** — still one single error area, never two.

## What did NOT change
- The math: same formulas, same `unitInMeters`, same de-DE formatting, same
  app-2.js fix (real-mode formula shows the result in the drawing unit:
  `4 cm × 25.000 = 100.000 cm`).
- The design system, brand, sections, SEO meta / JSON-LD, guide and FAQ content.
- The stack: vanilla HTML/CSS/JS, no framework, no images, no tracking.

## QA (2026-11-06)
- jsdom suite: **13/13 passed** — defaults, all 3 modes, live calc without button,
  all 3 example autofills, invalid-0 friendly error + invalid state, segmented
  indicator + disabled field, double submit, reset, persistence restore.
- Real Chromium (CDP): **1920 / 1280 / 768 / 390 — no horizontal overflow**,
  result `1 km` on load at every width. Screenshots eyeballed.
- **Bug found and fixed in QA:** at 768px the 3-column inputs clipped the scale
  value (`1 : 25…`). Fixed by stacking the calculator card at ≤900px and giving
  the scale field its own row.
- Not verified: a real phone tap-through (keyboard behaviour, copy button on iOS/Android).

## Update 2026-11-06 — Maßstabstabelle
New section `#tabelle` between Examples and Guide, like the competitor sites:
11 scales in order (1:50 → 1:100.000), columns Maßstab | 1 cm auf dem Plan |
10 cm auf dem Plan | Wofür? Every value verified against the calculator (26/26 checks).
Tapping a row fills the calculator with that scale. Fits without scrolling at 390px.

## Update 2026-11-06 — competitor study (rechneneinfach.de)
Studied https://rechneneinfach.de/massstabsrechner/ and took its best parts:
- Result shows in ALL units at once (`#result-also`, hidden in scale mode).
- Formula card lists all three formulas; guide gained step 04 (area, factor squared).
- Table grew 11 -> 17 rows: model scales 1:120 (TT) + 1:160 (N), big map scales
  1:200.000 / 1:500.000 / 1:1.000.000 / 1:2.000.000.
- New practice section `#ueben`: 2 Klasse-5 tasks with hidden solutions (own numbers).
- QA: 28/28 checks (table values, also-line, practice, area).

## Update 2026-11-06 — two-scale compare + volume
- New section `#vergleichen`: same route on a different map — length on map A +
  scale A + scale B -> length on map B, live calc. Default 3 cm, 1:25.000 ->
  1:50.000 = 1,5 cm. Friendly error on empty/zero fields.
- Guide step 05: volume, factor cubed (1 cm³ × 100³ = 1 m³).
- QA: 12/12 new checks + 28/28 regression.

## Update 2026-11-06 — two small fixes (Copilot is out)
User is not using Copilot to build anymore, so the rules swap is cancelled.
The two QA issues were fixed directly in this build instead:
- Live calc is silent while typing: clearing a field mid-typing no longer
  flashes the error or hides the last good result; the error only shows on
  submit (button / Enter). Same for the compare tool.
- Segmented control: role="tablist"/role="tab" + aria-selected replaced with
  role="group" + aria-pressed (there is no tabpanel, so tab semantics were wrong).
- QA: 15/15 checks (typing flow, submit error, ARIA, regression).

## Update 2026-11-06 — short practice rows + standout button
- Practice tasks: summaries were full sentences spanning the whole width.
  Now short titles ("Aufgabe 1: Wie lang ist die Straße?"); the full
  question + solution sit inside the opened row. List capped at 1050px,
  section spacing tightened.
- Calculate button: 52px -> 60px, 15px -> 17px bold, added lift shadow
  (deeper on hover) so it stands out from the card.
- QA: 8/8 checks.

## Update 2026-11-06 — tighter practice gap + orange CTAs
- Practice -> compare gap: the section still looked stretched (old stylesheet
  was cached in the browser). Gap cut to 24px + 24px (was 56px + 48px) and
  the stylesheet link now carries ?v=2 so browsers fetch the new CSS.
- "Jetzt berechnen" buttons are now orange (the single accent, dark text):
  header CTA + the big calculator button. Hover goes a touch darker.
- Also fixed a stale selector from the aria-pressed change: the active
  segmented button now gets its dark colour again.
- QA: computed styles verified (both buttons rgb(231,154,98) orange,
  dark text rgb(25,63,52)); gap measured 24px at 1280px.

## Hub — 2026-11-06 (maßklar is now a calculator hub)
Structure (same repo, GitHub Pages):
- `/` — hub homepage: hero, 13 tool cards (2 live, 11 "Bald da"),
  categories, why, FAQ. Own design + own German copy (not a copy of
  rechneneinfach.de — same tool ideas, our words).
- `/massstabsrechner/` — the Maßstab tool, moved here from root (root is
  now the hub). All content, demo rules and QA unchanged.
- `/altersrechner/` — Altersrechner (tool #2): birthdate + reference date
  (default today) -> exact age (years/months/days, real month lengths),
  total days/weeks, next-birthday countdown, zodiac. Live calc, silent
  errors while typing, localStorage `massklar_alter_v1`. QA 13/13
  (leap birthday, month borrow, same-day, zodiac boundaries, singulars).
- Shared `styles.css` (v3). Hub CSS lesson: responsive overrides must sit
  AFTER the hub base rules in the file, or the base 3-col grid wins on
  source order (caught a 390px overflow this way).
- Footers carry "Ein Produkt von Hastle Inc." (standing Hastle rule).
- Next tools in line (from the hub cards): Prozentrechner, BMI, Brutto-Netto.
