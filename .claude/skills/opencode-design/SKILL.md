---
name: opencode-design
description: Use when designing, restyling, or improving the UI/UX of the server-rendered chat frontend (src/public/chatAI.ejs, and other views under src/public/). Covers the dark theme palette, CSS conventions, responsive layout, accessibility, and how chat UI changes propagate. Front-load keywords like 'design', 'style', 'theme', 'UI', 'UX', 'chatAI', 'CSS', 'make it look better'.
------
name: opencode-terminal-ui
description: "Build dashboards, data views, settings pages, or app UI in OpenCode's terminal-inspired style — near-black surfaces, monospace type, hairline rules, labeled figures, monochrome-with-semantic-accents. Use when the user asks for an OpenCode-style, opencode.ai-style, terminal-style, or 'technical document' interface, or a usage/analytics/billing dashboard in that aesthetic."
---

# OpenCode Terminal-Style UI

Reproduce the look of **opencode.ai** and its workspace/usage dashboards: a dark-first, monospace, monochrome "technical document" aesthetic. Precise, flat, and quiet — color is reserved for data and status, never decoration.

Derived from OpenCode's public brand and marketing site. If you're matching a specific private dashboard, treat the tokens below as the baseline and adjust `--accent` / radii to taste.

## When to use

Any request for an OpenCode / opencode.ai / terminal-style interface, or for a **dashboard, usage/analytics/billing view, settings page, admin panel, table-heavy data app, or developer tool UI** in that aesthetic. Apply whether the deliverable is a standalone HTML page, a React component, or a section inside a larger app.

## Design principles

1. **Dark-first, near-black.** The page is almost black. Surfaces are layered by tiny lightness steps, not by shadow.
2. **Monospace is the identity.** Nav, headings, labels, numbers, and buttons are monospace. Body copy may be sans, but lean mono.
3. **Hairlines, not shadows.** Separate everything with 1px low-contrast borders. Avoid drop shadows entirely (a faint one only for true overlays).
4. **Monochrome by default.** Greyscale carries the whole UI. Color appears only for data series and semantic status (success / warn / danger / info).
5. **Technical-document framing.** Small faint captions (`Fig 1.`, `01`), uppercase micro-labels with letter-spacing, thin section rules. It should read like a precise spec sheet.
6. **Small or zero radii.** 4–6px on cards/inputs; 0px is on-brand for a more terminal feel. Never pill-shaped except tiny status dots.
7. **Tabular, right-aligned numbers.** Every metric uses `font-variant-numeric: tabular-nums`; numeric table columns are right-aligned.

## Layout structure (usage dashboard reference)

1. **Top bar / left rail** — dark, hairline border on the inner edge. Wordmark in monospace (use OpenCode's dark-mode wordmark asset if branding as OpenCode; otherwise a mono text wordmark). Nav items are lowercase or UPPERCASE mono, muted, with the active item at full foreground and a 1–2px underline/left-border marker.
2. **Page header** — mono `h1` (not large; ~20–24px, tight tracking) with an optional faint caption line above it (`USAGE · LAST 30 DAYS`). A hairline rule under the header separates it from content.
3. **Stat row** — 3–5 stat cards in a grid. Each card: a faint UPPERCASE micro-label on top, a large monospace number (tabular-nums) as the hero, and a small delta line (`+12.4%` in `--success`, `−3.1%` in `--danger`). Cards are `--bg-raised` with a hairline border, small radius, no shadow.
4. **Chart block** — labeled as a figure (`Fig 1. Requests over time`). Thin 1px series lines, gridlines in `--border`, axis labels in `--fg-faint` mono. Prefer a single series color (`--accent`) or muted semantic colors; never rainbow.
5. **Data table** — the workhorse. Header row on `--bg-inset` with faint UPPERCASE mono labels; body rows separated by 1px `--border` dividers (no zebra striping, or an extremely subtle one). Numbers right-aligned + tabular. Row hover lifts background to `--bg-inset`.
6. **Quota / usage bars** — a thin track (`--bg-inset`, ~6–8px tall, small radius) with a fill in `--fg` or a semantic color; percentage in mono to the right.

## Theme tokens

Define as CSS variables and reference everywhere. (Tailwind: map these to `theme.extend.colors` and use the class names; otherwise use `var(--…)` directly.)

```css
:root {
  /* surfaces — layered by tiny lightness steps, darkest → lifted */
  --bg:            #0a0a0a;  /* page */
  --bg-raised:     #121212;  /* cards, panels */
  --bg-inset:      #1a1a1a;  /* inputs, code blocks, table header, hover */

  /* hairlines */
  --border:        #262626;  /* default dividers/borders */
  --border-strong: #333333;  /* emphasis / focus edge */

  /* text */
  --fg:            #ededed;  /* primary */
  --fg-muted:      #8f8f8f;  /* secondary, labels */
  --fg-faint:      #5c5c5c;  /* captions, "Fig 1.", axis, meta */

  /* interactive — OpenCode is monochrome; primary action is INVERTED */
  --accent:        #fafafa;  /* links, active nav, single-series charts */
  --on-accent:     #0a0a0a;  /* text on a filled near-white button */

  /* semantic — the only real color, reserved for data + status */
  --success:       #3fb950;
  --warn:          #d29922;
  --danger:        #f85149;
  --info:          #58a6ff;

  /* type */
  --font-mono: "Geist Mono", "Berkeley Mono", "JetBrains Mono", ui-monospace,
               "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace;
  --font-sans: "Geist", ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;

  /* shape */
  --radius:    6px;
  --radius-sm: 4px;
}
```

Type & effects:
- Headings, nav, labels, numbers, buttons: `--font-mono`. Long body copy may use `--font-sans`.
- Micro-labels: `text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--fg-faint);`
- Numbers: `font-variant-numeric: tabular-nums;` always.
- Borders over shadows. Only real overlays (modals, menus) may use `box-shadow: 0 8px 32px rgba(0,0,0,.6)`.
- Focus: `outline: 1px solid var(--accent); outline-offset: 2px;` — never remove focus styles.

## Rules

- **Dark by default** — never a light page background (a light mode should invert to warm off-white `#fafaf8`, but default is near-black).
- **Monochrome chrome.** Bars, borders, text, and nav stay greyscale. Color belongs only to chart series, deltas, and status.
- **Hairlines everywhere, shadows almost never.** If you reach for a shadow to separate two panels, use a `1px` border instead.
- **Monospace signals the brand** — if headings and numbers aren't mono, it won't read as OpenCode.
- **Small/zero radii; no pills** (except tiny status dots).
- **Right-align + tabular-nums** on every numeric column and metric.
- **Label things like a spec sheet** — faint captions, `Fig N.`, section numbers, uppercase tracked micro-labels, thin rules between sections.
- Ensure keyboard focus states and `alt` text on any imagery for accessibility.
- When using OpenCode's own marks, pull from the brand assets rather than redrawing:
  - dark-mode wordmark: `https://opencode.ai/_build/assets/preview-opencode-wordmark-dark-tZ1Y3VXe.png`
  - dark-mode logo (square): `https://opencode.ai/_build/assets/preview-opencode-logo-dark-square-Byp5Dqxg.png`
  - full asset pack + SVGs: `https://opencode.ai/brand`

## Minimal reference markup (HTML/CSS)

```html
<section style="background:var(--bg);color:var(--fg);font-family:var(--font-mono);padding:24px;">
  <!-- page header -->
  <div style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px;">
    <div style="text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--fg-faint);">usage · last 30 days</div>
    <h1 style="font-size:22px;font-weight:600;letter-spacing:-.01em;margin:6px 0 0;">Overview</h1>
  </div>

  <!-- stat row -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:32px;">
    <div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
      <div style="text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--fg-faint);">Requests</div>
      <div style="font-size:30px;font-variant-numeric:tabular-nums;margin-top:8px;">128,402</div>
      <div style="font-size:12px;color:var(--success);margin-top:4px;">+12.4%</div>
    </div>
    <!-- repeat cards… -->
  </div>

  <!-- figure + table -->
  <div style="font-size:11px;color:var(--fg-faint);margin-bottom:8px;">Fig 1. Usage by model</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:var(--bg-inset);">
        <th style="text-align:left;padding:8px 12px;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--fg-faint);font-weight:500;">Model</th>
        <th style="text-align:right;padding:8px 12px;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--fg-faint);font-weight:500;">Tokens</th>
        <th style="text-align:right;padding:8px 12px;text-transform:uppercase;letter-spacing:.06em;font-size:11px;color:var(--fg-faint);font-weight:500;">Cost</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:10px 12px;">claude-opus-4-8</td>
        <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;color:var(--fg-muted);">4,201,880</td>
        <td style="padding:10px 12px;text-align:right;font-variant-numeric:tabular-nums;">$62.40</td>
      </tr>
      <!-- repeat rows… -->
    </tbody>
  </table>

  <!-- quota bar -->
  <div style="margin-top:24px;display:flex;align-items:center;gap:12px;">
    <div style="flex:1;height:6px;background:var(--bg-inset);border-radius:3px;overflow:hidden;">
      <div style="width:68%;height:100%;background:var(--fg);"></div>
    </div>
    <span style="font-size:12px;color:var(--fg-muted);font-variant-numeric:tabular-nums;">68%</span>
  </div>
</section>
```

## Buttons (inverted primary + ghost)

```css
.btn-primary { background:var(--accent); color:var(--on-accent); border:1px solid var(--accent);
  font-family:var(--font-mono); font-size:13px; padding:8px 14px; border-radius:var(--radius-sm); }
.btn-ghost   { background:transparent; color:var(--fg); border:1px solid var(--border);
  font-family:var(--font-mono); font-size:13px; padding:8px 14px; border-radius:var(--radius-sm); }
.btn-ghost:hover { background:var(--bg-inset); border-color:var(--border-strong); }
```