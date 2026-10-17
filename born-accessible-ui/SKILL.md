---
name: born-accessible-ui
description: >-
  Use for ANY task that creates, edits, styles, refactors or reviews web UI:
  HTML, CSS, design tokens, Tailwind, JavaScript or TypeScript components,
  React, Next.js, Vue, Svelte, Angular, Astro, Lit, pages, dashboards, forms
  and prototypes. Enforces the three Born-Accessible protocols (plan semantics
  first, mathematically verified color contrast, native HTML before ARIA) and
  runs a Playwright + axe-core verification loop until zero automated
  accessibility violations remain.
license: Apache-2.0
compatibility: >-
  The verification scripts need Node.js 18+, the npm packages playwright and
  @axe-core/playwright, and Google Chrome or Playwright's Chromium.
metadata:
  author: Dirk Ginader
  source: "a11yTO Conf 2026: The Aesthetic-A11y Paradox"
  version: "1.0.0"
---

# Born-Accessible UI

Build visually rich UI that is accessible on the first pass. Run this loop for every UI change:

**Plan → Build → Verify → Fix → Report**

- Full rules (read them before your first UI change in a session): [references/protocols.md](references/protocols.md)
- How to fix audit findings: [references/remediation.md](references/remediation.md)
- In the commands below, `<skill>` is the folder that contains this SKILL.md file.

## 1. Plan (Protocol 1: Silent Reasoning)

Before writing markup, write an `A11Y-PLAN` that covers:

1. **Landmarks**: what goes into `<header>`, `<nav aria-label>`, `<main>`, `<aside aria-label>` and `<footer>`.
2. **Headings**: one `<h1>` per page, then `h2` and `h3` without skipping levels.
3. **Controls**: every interactive element, its native HTML element, its accessible name and its keyboard behavior.
4. **Contrast pairs**: every text/background and UI/background color pair with its computed ratio.

Put the plan where it can't break the build: an HTML comment after `<!DOCTYPE html>` in a standalone page, a `{/* A11Y-PLAN ... */}` block in JSX/TSX, an HTML comment in Vue/Svelte/Angular templates, or your reply when you change several files.

When you build a single component, plan only its own semantics. Landmarks and the `<h1>` belong to the page layout, not to every component.

## 2. Build (Protocols 2 and 3)

- **Color tokens**: define colors as custom properties and annotate every foreground token with its *computed* contrast ratio, rounded down: `--text-muted: #cbd5e1; /* Contrast: 11.9:1 vs #111827 (AAA) */`. Minimums: 4.5:1 for normal text, 3:1 for large text and for UI parts such as input borders, focus rings and icons.
- **Native HTML first**: `<button>` for actions, `<a href>` for navigation, `<dialog>` with `showModal()` for modals, `<details>`/`<summary>` for disclosures, `<input type="checkbox" role="switch">` for toggles, `<label for>` for every form control. Never put click handlers on `<div>` or `<span>`.
- **Layout**: content reflows at 320 CSS px without horizontal scrolling, targets are at least 24×24 px, `:focus-visible` is clearly visible, and motion respects `prefers-reduced-motion`.

## 3. Verify (never skip, never estimate)

Run both checks after every UI change:

```bash
# Static: recomputes every "Contrast:" comment, flags clickable <div>s and removed outlines
node <skill>/scripts/lint.mjs <changed files or src folder>

# Runtime: Playwright + axe-core (WCAG 2.2 A/AA + best practices) on the initial view and on
# hidden states (dialogs, popovers, details, tabs, menus), plus a 320px reflow check
node <skill>/scripts/audit.mjs <url-or-html-path> [more targets]
```

- Audit every page or route you changed. For apps, start the dev server in the background first and pass its URLs (for example `http://localhost:5173/settings`). For static HTML, pass the files or a folder.
- UI that only exists after a click, such as a conditionally rendered modal: add `--click "<CSS selector of the trigger>"`.
- Exit codes: `0` = no automated violations, `1` = violations (details in `a11y-report/`), `2` = setup or page-load problem (is the dev server running?).
- Missing dependencies: run `npm install --save-dev playwright @axe-core/playwright` in the project. Only if Google Chrome isn't installed, also run `npx playwright install chromium`.
- Keep `a11y-report/` out of version control (add it to `.gitignore`).

## 4. Fix

1. Read `a11y-report/fix-prompt.md` (or `a11y-report/report.json` for full details) **and** the lint output. Fix lint errors too: axe can't see clickable `<div>`s or wrong `Contrast:` comments. To compare against the starting point later, run the first audit with `--out a11y-report/before`.
2. Fix at the source (tokens, shared components, layout rules) following [references/remediation.md](references/remediation.md). Keep the visual design: change lightness rather than going monochrome, and never hide content from assistive technology to silence a rule.
3. Run lint and audit again. Do at most **3 fix rounds** (a round = fixing violations, then re-running both checks). If violations remain, stop and report them with your best explanation.
4. Check every "needs review" item (the `review` lines in the audit output, also listed in `fix-prompt.md` and `report.json`). They are not failures; axe-core couldn't decide. These checks don't count toward the 3 rounds.
   - Text on gradients, images or translucent ("glass") surfaces: check the worst spot by eye, or put a solid backdrop behind the text so axe can compute it.
   - "Partially overlaps other elements", common for text inside a modal `<dialog>` or near positioned elements: don't change code for this. Verify the real colors in DevTools or a screenshot and record the result.

## 5. Report

- Say "0 automated axe-core violations". Never claim "WCAG compliant" or "accessibility verified": automated tools catch only part of all barriers.
- List each "needs review" item you checked by hand as *manually verified*, with the colors and ratio you measured.
- List what still needs a human: a keyboard walk-through (Tab, Shift+Tab, Enter, Space, Esc, arrow keys in composite widgets), visible focus everywhere, a screen reader spot check of names, roles and states, 200% zoom, and meaningful alt text, link text and error messages.
