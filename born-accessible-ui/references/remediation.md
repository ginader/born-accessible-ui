# Remediation playbook

How to fix what `scripts/audit.mjs` and `scripts/lint.mjs` report, without breaking the design.

## Ground rules

1. **Fix at the source.** Change the design token, shared component or layout rule, not one element with an override.
2. **Keep the aesthetic.** Shift lightness within the same hue; don't strip the palette down to black and white.
3. **Never silence a rule.** Don't add `aria-hidden`, `role="presentation"` or delete content just to make a check pass.
4. **Native beats ARIA.** If a fix needs more than one ARIA attribute, look for the native element first.
5. **Re-run both checks** after every round. Stop after 3 rounds and report what's left.

---

## Color

### `color-contrast` (WCAG 1.4.3)
axe names both colors and the required ratio, for example *"insufficient color contrast of 3.75 (foreground color: #64748b, background color: #0f172a) ... Expected contrast ratio of 4.5:1"*.

- Find the token behind the foreground (or background) and adjust its lightness until it passes: at least 4.5:1 for normal text, 3:1 for text that is at least 24px or 18.66px bold.
- Dark surfaces: lighten the text (`#64748b` → `#cbd5e1` on `#0f172a`). Light surfaces: darken it (`#94a3b8` → `#475569` on white).
- Colored pills, badges and buttons: give every background its own paired `--*-text` token (for example `#991b1b` on `#fee2e2`, 6.8:1).
- Update the token's `/* Contrast: X.X:1 vs #bg (AA) */` comment, rounded down, and run `lint.mjs`.
- Legacy page without tokens? Introduce custom properties in `:root` first, then fix the values there, so later fixes stay at the source.
- After recoloring, check that states are still distinguishable. If inactive links get lighter, the active link may now look the same. Keep a visible difference that isn't just a slightly different color: weight, an indicator bar, an underline, or a clearly different background.

### `contrast-assertion` (lint)
A `Contrast:` comment claims more than the colors deliver, or the colors miss the level the comment names. Either correct the number (lint prints the real ratio) or change the color until the claim is true.

### Needs review (not failures)
axe-core couldn't decide these. Check each one, record the result, and only change code if the check shows a real problem.

- **Text on gradients, background images or translucent "glass" surfaces:** check the worst spot by eye. Or make it computable: put a solid or near-opaque backdrop behind the text, or increase the lightness difference until even the closest point of the gradient passes.
- **"Background color could not be determined because it partially overlaps other elements":** common for text inside a modal `<dialog>` (the page content sits behind it) or near absolutely positioned elements. A backdrop won't make this go away. Verify the real foreground and background colors in DevTools or a screenshot, and report the item as manually verified with the ratio you measured.

---

## Layout

### `reflow` (WCAG 1.4.10, kit check)
The page scrolls sideways at 320 CSS px (equivalent to 400% zoom on a 1280px screen). The report lists the outermost elements that stick out.

- Replace fixed column layouts: `grid-template-columns: 230px 1fr` → one column below about 48rem; `repeat(3, 1fr)` → `repeat(auto-fit, minmax(min(100%, 14rem), 1fr))`; use `minmax(0, 1fr)` so grid items can shrink.
- Let toolbars and headers wrap (`flex-wrap: wrap`). Give long strings `overflow-wrap: anywhere`.
- Wide data tables may scroll on their own:

```html
<div class="table-wrap" role="region" aria-labelledby="deploy-caption" tabindex="0">
  <table>
    <caption id="deploy-caption">Recent deployments</caption>
    ...
  </table>
</div>
<style>.table-wrap { overflow-x: auto; }</style>
```

### `target-size` (WCAG 2.5.8)
Make interactive targets at least 24×24 CSS px, or space them so a 24px circle around each one doesn't overlap another target.

### `meta-viewport`
Never block zooming: remove `maximum-scale=1` and `user-scalable=no`.

---

## Structure

### `region`, `landmark-one-main`, `landmark-unique`, `landmark-*-is-top-level`
- Put every visible element inside `<header>`, `<nav aria-label>`, `<main>`, `<aside aria-label>` or `<footer>`. Wrapper `<div>`s are fine.
- Use exactly one `<main>`. A `<header>` or `<footer>` placed directly in `<body>` becomes the page's banner or contentinfo landmark; don't nest those inside `<main>`.
- Repeated landmarks need unique names: `<nav aria-label="Primary">`, `<nav aria-label="Pagination">`.

### `page-has-heading-one`, `heading-order`, `empty-heading`
Use one `<h1>` that names the page. To fix the order, change the heading *element* and keep the look with a CSS class.

### `list`, `listitem`, `definition-list`
Only `<li>` may sit directly inside `<ul>`/`<ol>`; only `<dt>`/`<dd>` (optionally wrapped in a `<div>`) inside `<dl>`.

### `possible-truncation` (kit check)
The HTML file has an unclosed `<style>` or `<script>`, doesn't end with `</html>`, or contains an elision placeholder such as "rest of the code unchanged". Regenerate the complete file.

---

## Names and labels

### `label`, `select-name`, `placeholder-only-label` (kit check)

```html
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email">

<!-- design without a visible label -->
<label for="q" class="visually-hidden">Search projects</label>
<input id="q" type="search" placeholder="Search…">
```

### `button-name`, `link-name`, `image-alt`, `svg-img-alt`

```html
<button type="button" aria-label="Notifications">
  <svg aria-hidden="true" focusable="false">...</svg>
</button>

<img src="revenue.png" alt="Revenue grew 12% from June to July">
<img src="divider.svg" alt="">  <!-- decorative -->
```

### `document-title`, `html-has-lang`, `frame-title`
Give the page a descriptive `<title>`, give `<html>` a `lang` attribute, and give every `<iframe>` a `title`.

---

## Interaction and ARIA

### `clickable-non-semantic`, `role-button` (lint)

```html
<!-- before -->
<div class="btn" role="button" tabindex="0">Save</div>

<!-- after: focus, Enter/Space and the role come for free -->
<button type="button" class="btn">Save</button>
```

Navigation items become `<a href>` inside `<nav>`, with `aria-current="page"` on the active one.

### `aria-allowed-attr`, `aria-valid-attr-value`, `aria-required-children`, `aria-required-parent`, `aria-prohibited-attr`
These usually point to a custom widget with incomplete ARIA. Prefer the native element (`<select>`, `<details>`, `<dialog>`, `<button aria-pressed>`). If a custom widget is unavoidable, follow its ARIA Authoring Practices Guide pattern exactly: roles, states and keyboard support.

### `nested-interactive`
Don't put buttons or links inside other buttons or links (for example a card link that contains a "Delete" button). Make the card title the link and keep the button separate.

### `aria-hidden-focus`
Content inside `aria-hidden="true"` must not be focusable. Remove `aria-hidden`, or use `inert` for content that really is unavailable.

### `scrollable-region-focusable`
Scrollable containers need `tabindex="0"` plus `role="region"` and an accessible name so keyboard users can scroll them.

### `outline-removed` (lint)
Keep a visible focus indicator: `:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }`, with the ring color at least 3:1 against the surface.
