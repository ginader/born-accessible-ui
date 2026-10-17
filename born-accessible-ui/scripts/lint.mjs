#!/usr/bin/env node
/**
 * lint.mjs: static Born-Accessible checks. No dependencies, no browser.
 *
 *   contrast-assertion      recomputes every `Contrast: X.X:1 vs #bg` comment
 *                           with the WCAG 2 formula (Protocol 2)
 *   clickable-non-semantic  click handlers on <div>, <span>, <li>, ... (Protocol 3)
 *   role-button             role="button" on non-button elements (Protocol 3)
 *   outline-removed         outline removed and no focus style anywhere (warning)
 *
 * Usage:      node lint.mjs [files or folders ...] [--strict]
 *             (default: current folder; --strict also fails on warnings)
 * Exit codes: 0 = no errors, 1 = errors found, 2 = usage error
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const USAGE = `Born-Accessible lint: static accessibility checks

Usage:
  node lint.mjs [files or folders ...] [--strict]

Checks:
  contrast-assertion      every "/* Contrast: X.X:1 vs #bg (AA) */" comment is recomputed
  clickable-non-semantic  onClick / @click / (click) on <div>, <span>, <li>, ...
  role-button             role="button" on non-button elements
  outline-removed         outline: none with no focus style anywhere (warning)

Exit codes: 0 = no errors, 1 = errors (or warnings with --strict), 2 = usage error`;

const EXTENSIONS = new Set(['.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.md', '.mdx']);
const MARKUP = new Set(['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'a11y-report']);
const MAX_BYTES = 1024 * 1024;
const TOLERANCE = 0.05;

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b';
const TOKEN_RE = new RegExp(`(--[\\w-]+)\\s*:\\s*(${HEX})`, 'g');
// A declaration (custom property or color property, hex or var() value) followed by a
// "Contrast: <ratio>:1 vs <hex | --token | var(--token)> (<level>)" comment on the same line.
const DECL_RE = new RegExp(`([\\w-]+)\\s*:\\s*([^;{}:\\n\`]+?)\\s*;?\\s*\\/\\*\\s*Contrast:\\s*([\\d.]+)\\s*:\\s*1\\s*(?:vs\\.?|on|against)\\s*(var\\(\\s*--[\\w-]+\\s*\\)|--[\\w-]+|${HEX})([^*]*)\\*\\/`, 'gi');
// plan lines: "--text (#f8fafc) on --bg (#090d16) = 18.5:1 (AAA)" or "#fff on #1d4ed8 = 6.7:1".
// The tail only captures the "(level)" label, so several pairs on one line are all checked.
const PLAN_RE = new RegExp(`(${HEX})\\)?\\s+on\\s+[^=\\n]*?\\(?(${HEX})\\)?\\s*=\\s*([\\d.]+)\\s*:\\s*1((?:\\s*\\([^)\\n]*\\))?)`, 'gi');
// "Contrast: #0F172A on #FFFFFF (17.8:1 AAA)"
const INLINE_RE = new RegExp(`Contrast:\\s*(${HEX})\\s+on\\s+(${HEX})\\s*\\(?\\s*([\\d.]+)\\s*:\\s*1([^)\\n]*)`, 'gi');
const CLICKABLE_RE = /<(div|span|li|p|i|img|svg|td|tr|section|article|figure)\b(?=[^>]*?\s(?:onClick|onclick|@click|v-on:click|\(click\)|on:click)\s*=)/g;
const ROLE_BUTTON_RE = /<(div|span|a|li|p|i|img|svg|td)\b(?=[^>]*?\srole\s*=\s*["']button["'])/g;
const OUTLINE_RE = /outline\s*:\s*(?:none|0)\s*(?:!important)?\s*[;}"']|\boutline-none\b/g;
const FOCUS_STYLE_RE = /:focus-visible|focus-visible:|:focus\b|focus:ring|focus:outline-(?!none)/;

main().catch((err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(2);
});

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const strict = args.includes('--strict');
  const inputs = args.filter((a) => a !== '--strict');
  const unknown = inputs.find((a) => a.startsWith('-'));
  if (unknown) usageError(`Unknown option: ${unknown}`);

  const files = await collectFiles(inputs.length ? inputs : ['.']);
  const sources = [];
  for (const file of files) {
    const info = await stat(file);
    if (info.size > MAX_BYTES) continue;
    sources.push({ file, rel: path.relative(process.cwd(), file) || file, ext: path.extname(file).toLowerCase(), text: await readFile(file, 'utf8') });
  }

  const globalTokens = new Map();
  for (const src of sources) {
    for (const [, name, value] of src.text.matchAll(TOKEN_RE)) {
      if (!globalTokens.has(name)) globalTokens.set(name, new Set());
      globalTokens.get(name).add(value.toLowerCase());
    }
  }
  const hasFocusStyle = sources.some((s) => FOCUS_STYLE_RE.test(s.text));

  const findings = [];
  let verified = 0;
  for (const src of sources) {
    const fileTokens = new Map();
    for (const [, name, value] of src.text.matchAll(TOKEN_RE)) if (!fileTokens.has(name)) fileTokens.set(name, value.toLowerCase());
    const report = (index, severity, rule, message) => findings.push({ where: `${src.rel}:${lineOf(src.text, index)}`, severity, rule, message });

    for (const m of src.text.matchAll(DECL_RE)) {
      const fg = resolveColor(m[2], fileTokens, globalTokens);
      const bg = resolveColor(m[4], fileTokens, globalTokens);
      const label = m[1].startsWith('--') ? m[1] : `${m[1]} ${m[2].trim()}`;
      verified += checkAssertion({ label, fg, bg, claimed: Number(m[3]), tail: m[5], index: m.index, report });
    }
    for (const re of [PLAN_RE, INLINE_RE]) {
      for (const m of src.text.matchAll(re)) {
        verified += checkAssertion({ label: 'plan', fg: { hex: m[1] }, bg: { hex: m[2] }, claimed: Number(m[3]), tail: m[4], index: m.index, report });
      }
    }

    // Markup checks ignore comments: an A11Y-PLAN may describe old markup. Blanking keeps
    // offsets and newlines, so reported line numbers stay correct.
    const code = src.text.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    if (MARKUP.has(src.ext)) {
      for (const m of code.matchAll(CLICKABLE_RE)) {
        report(m.index, 'error', 'clickable-non-semantic', `<${m[1]}> has a click handler. Use <button type="button"> for actions or <a href> for navigation (Protocol 3).`);
      }
      for (const m of code.matchAll(ROLE_BUTTON_RE)) {
        report(m.index, 'error', 'role-button', `role="button" on <${m[1]}>. Use a native <button>; it brings focus, Enter/Space and the role for free.`);
      }
    }
    if (!hasFocusStyle) {
      for (const m of code.matchAll(OUTLINE_RE)) {
        report(m.index, 'warning', 'outline-removed', 'Focus outline removed and no focus style found in the scanned files. Add a visible :focus-visible style.');
      }
    }
  }

  for (const f of findings) console.log(`${f.where}  ${f.severity.padEnd(7)}  ${f.rule.padEnd(22)}  ${f.message}`);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  if (findings.length) console.log('');
  console.log(`Born-Accessible lint: ${sources.length} file(s), ${verified} contrast assertion(s) verified, ${errors} error(s), ${warnings} warning(s)`);
  if (!verified && !errors) console.log('Hint: no "Contrast:" assertions found. Protocol 2 asks for one next to every foreground color token.');
  process.exit(errors || (strict && warnings) ? 1 : 0);
}

function usageError(message) {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

async function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const abs = path.resolve(input);
    const info = await stat(abs).catch(() => null);
    if (!info) usageError(`Not found: ${input}`);
    if (info.isDirectory()) await walk(abs, files);
    else files.push(abs); // explicitly named files are always checked
  }
  return [...new Set(files)];
}

async function walk(dir, files) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && !/\.min\./.test(entry.name)) files.push(full);
  }
}

function checkAssertion({ label, fg, bg, claimed, tail, index, report }) {
  if (fg.error || bg.error) {
    report(index, 'warning', 'contrast-assertion', `${label}: can't verify (${fg.error || bg.error}).`);
    return 0;
  }
  const a = parseHex(fg.hex);
  const b = parseHex(bg.hex);
  if (!a || !b) {
    report(index, 'warning', 'contrast-assertion', `${label}: can't verify transparent colors (${fg.hex} on ${bg.hex}); the result depends on what is behind them.`);
    return 0;
  }
  const actual = contrast(a, b);
  const { level, min } = threshold(tail);
  const floor = Math.floor(actual * 10) / 10;
  const meets = actual >= 7 ? 'AAA' : actual >= 4.5 ? 'AA' : actual >= 3 ? 'AA large text / UI' : 'nothing';
  const suggestion = meets === 'nothing'
    ? `Pick a color that meets ${level}.`
    : `Write "Contrast: ${floor}:1 vs ${bg.hex} (${meets})" or pick a color that meets ${level}.`;
  if (claimed > actual + TOLERANCE) {
    report(index, 'error', 'contrast-assertion', `${label}: ${fg.hex} on ${bg.hex} claims ${claimed}:1 but is ${actual.toFixed(2)}:1. ${suggestion}`);
  } else if (actual < min) {
    report(index, 'error', 'contrast-assertion', `${label}: ${fg.hex} on ${bg.hex} is ${actual.toFixed(2)}:1, below the ${level} minimum of ${min}:1. ${suggestion}`);
  }
  return 1;
}

function threshold(tail = '') {
  const large = /\blarge\b/i.test(tail);
  const ui = /\b(ui|non-text|border|icon|focus|graphic)/i.test(tail);
  if (/\bAAA\b/.test(tail)) return { level: 'AAA', min: large || ui ? 4.5 : 7 };
  if (ui) return { level: 'UI (non-text)', min: 3 };
  if (large) return { level: 'AA large text', min: 3 };
  return { level: 'AA', min: 4.5 };
}

function resolveColor(raw, fileTokens, globalTokens) {
  const value = raw.trim();
  if (new RegExp(`^${HEX}$`).test(value)) return { hex: value.toLowerCase() };
  const token = value.match(/^(?:var\(\s*)?(--[\w-]+)/);
  if (!token) return { error: `"${value.slice(0, 40)}" is not a hex color or custom property` };
  const name = token[1];
  if (fileTokens.has(name)) return { hex: fileTokens.get(name) };
  const values = globalTokens.get(name);
  if (values?.size === 1) return { hex: [...values][0] };
  if (values?.size > 1) return { error: `${name} has different values in different files` };
  return { error: `${name} is not defined as a hex color in the scanned files` };
}

function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6) return null; // 4/8-digit hex has alpha
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}
