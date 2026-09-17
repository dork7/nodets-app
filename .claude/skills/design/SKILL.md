---
name: design
description: Use when designing, restyling, or improving the UI/UX of the server-rendered chat frontend (src/public/chatAI.ejs, and other views under src/public/). Covers the dark theme palette, CSS conventions, responsive layout, accessibility, and how chat UI changes propagate. Front-load keywords like 'design', 'style', 'theme', 'UI', 'UX', 'chatAI', 'CSS', 'make it look better'.
---
---
name: claude-code-ui-style
description: Build interfaces in Claude Code's visual style — warm terracotta/rust accent on cream or warm-dark surfaces, a single hot accent used with restraint, monospace-forward type, and generous vertical rhythm. Use this whenever the user wants a UI, TUI/CLI, dashboard, chat interface, or component that should "look like Claude Code," "match Claude's aesthetic," feel "warm/terminal-y," or use Anthropic's terracotta palette — even if they just say "make it look like Claude." It covers colors, typography, layout, and component patterns. Apply it to both terminal UIs and web/app recreations of that look.
---

# Claude Code UI Style

This skill captures the *visual language* of Claude Code so an interface built with it is recognizable at a glance. The essence is warmth with restraint: where most developer tools reach for clinical blues and pure-black terminals, Claude Code uses warm earth tones, a single terracotta accent, and calm spacing that makes long stretches of text comfortable to read. Do not over-decorate — the style's power comes from one hot accent against quiet surfaces, not from many colors.

Match the *feel* first: warm, approachable, professional. Every specific value below serves that feel.

## Color palette

The signature is a rust/terracotta orange — Claude's brand color — used sparingly as the single accent. Surfaces are warm (cream in light mode, warm charcoal in dark mode), never cold grey or pure black. Text is warm off-black or warm off-white, never `#000` or `#fff`.

Use these tokens (hex values are the recognizable Claude palette; some are community-derived approximations, so treat them as a starting point and adjust to taste):

```
Accent (primary)rgb(39, 38, 38)   coral-terracotta — the hero, use for one thing at a time
Accent (deep)rgb(43, 41, 41)   rust-orange — hover/active, borders, emphasis
Accent (soft)rgb(21, 19, 18)   muted terracotta — subtle highlights, secondary marks

Light surfaces
  --floral-white: #fffcf2ff;
  --dust-grey: #ccc5b9ff;
  --charcoal-brown: #403d39ff;
  --carbon-black: #252422ff;
  --spicy-paprika: #eb5e28ff;

Dark surfaces
  Background          #1A1815   warm charcoal (brown-black, not blue-black)
  Surface / card      #262320   raised warm panel
  Text (primary)      #EDE6DA   warm off-white
  Text (muted)        #9A9082   warm dim grey

Semantic (diffs, status)
  Success / additions #6B9B6E   muted sage green
  Error / deletions   #C1554A   muted brick red
  Warning             #D9A441   amber
```

Rules that keep it on-style:
- **One accent at a time.** The terracotta earns attention because it's rare. If everything is orange, nothing is. Buttons, the active input border, the cursor, a selected item — pick the *one* thing that matters in a given view and let it be the accent.
- **Warm neutrals, not grey.** Every neutral leans warm (a touch of red/yellow). A blue-grey instantly breaks the Claude feel.
- **No pure black or white.** Anchor on the warm near-black/off-white tokens above.
- **Muted semantics.** Diff greens/reds are desaturated so they sit inside the warm palette rather than screaming.

## Typography

The terminal is dense, so type does the hierarchy work. Body and code are monospace; brand/headings can shift to a warm serif for the approachable, editorial feel — but keep functional UI monospace for legibility.

- **Monospace** for code, tool output, input, and most functional text — e.g. `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`.
- **Warm serif** (optional, for prose/branding) — e.g. `ui-serif, Georgia, "Times New Roman", serif`. Claude's brand leans serif; use it for a welcome banner or headings, not for dense UI.
- **Hierarchy through weight and dim, not size.** In a terminal you have few sizes, so lean on **bold** for emphasis, dim/muted for secondary, and generous spacing. ALL-CAPS with letter-spacing (`H E A D E R`) reads as a section header.
- **Comfortable line length and line-height.** This UI is read more than it is skimmed — favor ~1.5 line-height and don't cram.

## Layout

Claude Code's layout is a vertical, conversation-shaped column with a persistent input anchored at the bottom. Reproduce that structure:

- **Bottom-anchored input box.** A bordered input pinned to the bottom, its border switching to the terracotta accent when focused/active. This is the visual signature of the interface.
- **Vertical message flow above it.** Content stacks top-to-bottom in a single readable column; the newest content sits just above the input.
- **Bordered panels for structure.** Group related output (tool calls, results, diffs) in bordered boxes. In a TUI use box-drawing characters (`╭─╮ │ ╰─╯`); on web use 1px warm borders with subtle rounding.
- **Generous vertical rhythm.** Breathing room between blocks. Density comes from information, not from cramming pixels.
- **Restrained chrome.** Minimal persistent UI — no heavy toolbars or sidebars competing with the content. The content column is the product.

## Component patterns

- **Input box** — bordered, full-width, bottom-pinned. Neutral border at rest, terracotta border when active. A terracotta cursor/prompt marker (`›` or `❯`) reinforces the accent.
- **Tool / status blocks** — bordered panels with a small labeled header (e.g. a dim tool name), often prefixed with a themed glyph. Keep the border neutral; reserve accent color for state that matters.
- **Spinner / working state** — a single animated glyph in the accent color (Claude Code uses an asterisk-style mark, `✻ / ✳ / ✶`). One moving accent element, nothing else competing.
- **Diffs** — muted sage for additions, muted brick for deletions, on the warm surface. Line-based, monospace, with a subtle gutter.
- **Banner / header** — an optional ASCII-art or serif wordmark on launch, in the accent color, then get out of the way.

## Terminal vs. web

- **Terminal / TUI:** use 24-bit true color where the terminal supports it to hit the exact palette; fall back to ANSI (the accent maps naturally to bright-red/`redBright`). Reach for a TUI framework's styling — Ink (Node), Rich (Python), Bubbletea (Go), Ratatui (Rust). Box-drawing characters carry the layout.
- **Web / app:** translate the same tokens to CSS variables. Rounded-but-restrained borders (`border-radius: 6px`), warm surfaces, the terracotta accent on interactive state, a monospace stack for functional text. Keep the bottom-anchored input and single-column flow.

## Example

**Task:** "Give me a chat input styled like Claude Code."

- **Palette:** warm charcoal background `#1A1815`, input surface `#262320`, text `#EDE6DA`.
- **Border:** neutral `#3A362F` at rest; on focus, switch to terracotta `#D97757`.
- **Prompt marker:** a `❯` in `#D97757` before the caret; caret also terracotta.
- **Type:** monospace, comfortable padding, ~1.5 line-height.
- **Placement:** pinned to the bottom of a single-column layout, full width, subtle 6px rounding.

The result reads as Claude Code because it gets the fundamentals right: warm surfaces, exactly one terracotta accent (the focus border + marker), monospace text, and calm spacing — not because it piled on decoration.