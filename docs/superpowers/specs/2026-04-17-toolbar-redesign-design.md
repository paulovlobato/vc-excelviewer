# Toolbar Redesign — Design Spec
**Date:** 2026-04-17
**Status:** Approved

## Problem

The CSV viewer has a top toolbar with two prominent blue buttons ("Reset Filters", "Export CSV"). The toolbar takes ~26px of vertical space above the grid and looks visually heavy — not in keeping with a minimal, editor-native feel.

## Goal

Move the action buttons to a subtle bottom status bar, freeing the grid to use full vertical height and reducing visual noise.

## Scope

- **In scope:** CSV viewer toolbar (`out/csv.js`, `out/styles/vscode.css`)
- **Out of scope:** Excel viewer sheet tabs (unchanged), find bar overlay (unchanged)

## Design

### Layout

```
┌─────────────────────────────────────────┐
│ data.csv                    [🔍 Ctrl+F] │  ← VS Code titlebar (unchanged)
├─────────────────────────────────────────┤
│                                         │
│              AG Grid                    │  ← grid takes full height (no toolbar above)
│                                         │
├─────────────────────────────────────────┤
│ 1,234 rows · 8 cols      ⊘ Reset  ↓ Export │  ← redesigned status bar
└─────────────────────────────────────────┘
```

### Status Bar

A `#status-bar` div already exists (created by `initStatusBar()` as a flat `textContent` element). This redesign **rewrites** `initStatusBar()` and `updateStatusBar()` top-to-bottom, and **replaces** the existing `#status-bar` CSS rules.

- **Position:** Bottom of the webview, below the AG Grid container (`#flex`)
- **Background:** `var(--vscode-statusBar-background, #252526)` (replaces current fallback `#007acc`)
- **Foreground:** `var(--vscode-statusBar-foreground, #cccccc)` (replaces current fallback `#fff`)
- **Top border:** `1px solid var(--vscode-panel-border, #3c3c3c)` — **new property, not present in current CSS**
- **Layout:** `display: flex; justify-content: space-between; align-items: center`
- **Padding:** `3px 10px` — remove the existing `height: 22px` property entirely (height is determined by padding)

#### DOM structure (replaces existing flat `textContent` approach)

```html
<div id="status-bar">
  <span id="status-info"></span>
  <span id="status-actions">
    <button id="btn-reset">⊘ Reset</button>
    <button id="btn-export">↓ Export</button>
  </span>
</div>
```

- `#status-info` — populated by `updateStatusBar()`, see format below
- `#status-actions` — `display: flex; gap: 4px`
- `#btn-reset` (replaces old `#btn-reset-filters`), `#btn-export` (same id — no collision once toolbar is removed first)

#### Button style

No `!important` needed on button rules — `color: inherit` inherits from `#status-bar` which the theme overrides target directly.

```css
#btn-reset, #btn-export {
  background: transparent;
  border: none;
  color: inherit;
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
#btn-reset:hover, #btn-export:hover {
  background: var(--vscode-toolbar-hoverBackground, #3c3c3c);
}
```

### Row/Column Count

`updateStatusBar()` must be rewritten to update `#status-info` instead of `bar.textContent` (which would clobber the buttons). Preserve the existing filtered/unfiltered distinction and add column count:

```js
function updateStatusBar() {
  var displayed = 0;
  gridApi.forEachNodeAfterFilter(function() { displayed++; });
  var total = sourceData.length;
  var cols = (gridApi.getColumns() || []).filter(function(c) {
    return c.getColId() !== '__lineNum';
  }).length;
  var rowText = displayed === total
    ? total.toLocaleString() + ' rows'
    : 'Showing ' + displayed.toLocaleString() + ' of ' + total.toLocaleString() + ' rows';
  var info = document.getElementById('status-info');
  if (info) info.textContent = rowText + ' · ' + cols + ' cols';
}
```

Note: use `gridApi.getColumns()` — already used elsewhere in `csv.js` for this AG Grid v32 build. `getAllDisplayedColumns()` does not exist in this version.

### `initStatusBar()` — rewrite rules

1. **Replace** the early-return guard `if (document.getElementById('status-bar')) return;` with `if (document.getElementById('status-info')) return;` — this makes the function idempotent (safe to call on every `refresh` message) while still allowing it to build the new DOM structure on first run.
2. Wire `#btn-reset` to clear the filter model (same logic as old `#btn-reset-filters`).
3. Wire `#btn-export` to call `gridApi.exportDataAsCsv()` (same logic as old `#btn-export`).

### `initToolbar()` — full removal

Delete both:
1. The `initToolbar()` function body
2. The `initToolbar()` call inside `initPage()` (currently at line 525) — leaving the call after the function is deleted causes a `TypeError`

### `copyToClipboard()` — call site update

`copyToClipboard()` currently writes `bar.textContent = 'Copied!'`, which clobbers the buttons. Replace with:

```js
var info = document.getElementById('status-info');
if (info) {
  info.textContent = feedback;  // use the caller-supplied feedback string, not a hardcoded 'Copied!'
  setTimeout(updateStatusBar, 2000);  // keep existing 2000 ms delay
}
```

### `resizeGrid()` — remove stale `'toolbar'` entry

`resizeGrid()` currently subtracts heights for `['toolbar', 'status-bar']`. Remove `'toolbar'` from the array since `#toolbar` no longer exists in the DOM.

`#status-bar` no longer has a hardcoded `height: 22px` — its height is derived from padding at runtime. `resizeGrid()` reads `offsetHeight` dynamically, so no further adjustment is needed; removing `'toolbar'` is the only required change here.

## Files Changed

| File | Change |
|------|--------|
| `out/csv.js` | Delete `initToolbar()` function and its call in `initPage()`; rewrite `initStatusBar()` (remove early-return guard, new DOM structure, button wiring); rewrite `updateStatusBar()` to target `#status-info`, preserve filtered row display, add col count; update `copyToClipboard()` to target `#status-info`; remove `'toolbar'` from `resizeGrid()` array |
| `out/styles/vscode.css` | Delete `#toolbar`, `#btn-reset-filters`, `#btn-export` CSS blocks; replace existing `#status-bar` block (remove `height: 22px`, add `justify-content: space-between`, add `border-top`, update color tokens); add `#status-info`, `#status-actions`, `#btn-reset`, `#btn-export` rules; in `csv-theme-light`: change `#toolbar, #status-bar` selector to `#status-bar` only, keep `!important` and existing values (`background-color: #f3f3f3 !important; border-color: #d4d4d4 !important; color: #1f1f1f !important`); in `csv-theme-dark`: same (`background-color: #252526 !important; border-color: #3c3c3c !important; color: #d4d4d4 !important`) — `!important` is required here to override the base `#status-bar` rule |

## Not Changed

- `out/excel.js` — no toolbar; sheet tabs stay
- `src/csvDocumentView.ts` — HTML template unchanged
- Find bar behavior — unchanged
- All message-passing logic — unchanged
