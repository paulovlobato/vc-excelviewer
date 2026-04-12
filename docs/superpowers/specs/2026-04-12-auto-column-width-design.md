# Auto Column Width Design

**Date:** 2026-04-12
**Status:** Approved

## Problem

All columns currently default to the same fixed width. When opening CSV/Excel files with many columns (e.g. 10+), this wastes horizontal space on narrow columns and clips content in wide ones.

## Goal

Columns auto-size to fit their content on load, capped at a configurable maximum width to prevent any single column from dominating the view.

## Approach

Use AG Grid's built-in `autoSizeAllColumns()` — already present in CSV (opt-in) and Excel (unconditional, but currently uncapped) — as the default behavior. Add a `maxWidth` to `defaultColDef` so AG Grid respects the cap during auto-sizing.

## Breaking Change Note

Changing `csv-preview.resizeColumns` default from `"none"` to `"all"` will affect existing users on extension update — columns that were previously fixed-width will start auto-sizing on every file open. This is intentional and desirable. Users who prefer fixed widths can set `csv-preview.resizeColumns` to `"none"` to restore the old behavior.

## Changes

### 1. `package.json`

- Change `csv-preview.resizeColumns` default from `"none"` to `"all"`
- Add new setting:
  ```json
  "csv-preview.maxColumnWidth": {
    "type": "number",
    "default": 300,
    "description": "Maximum column width in pixels when auto-sizing columns."
  }
  ```

### 2. `src/csvDocumentView.ts`

Pass the new setting into the webview options:
```ts
maxColumnWidth: <number>config.get("maxColumnWidth"),
```

### 3. `src/excelDocumentView.ts`

Pass the new setting into the webview options (Excel viewer reads from `csv-preview` namespace since it's a shared UI preference):
```ts
maxColumnWidth: <number>workspace.getConfiguration('csv-preview').get("maxColumnWidth"),
```

### 4. `out/csv.js`

Add to `defaultColDef`:
```js
maxWidth: options.maxColumnWidth != null ? options.maxColumnWidth : 300
```

### 5. `out/excel.js`

Add `maxWidth` to the `defaultColDef` object literal inside `gridOptions` in `initPage()` (not adjacent to the `autoSizeAllColumns()` call in `loadSheet()` — `defaultColDef` is a grid-level option set once at creation time):
```js
maxWidth: options.maxColumnWidth != null ? options.maxColumnWidth : 300
```

Note: `excel.js` already calls `autoSizeAllColumns()` unconditionally today, but with no cap. This change adds the cap. The `resizeColumns` setting does not gate Excel's auto-sizing — it is unconditional.

## Behavior After Change

1. File opens → data loads → `autoSizeAllColumns()` called
2. AG Grid measures rendered cell content and sets each column width to fit the widest value
3. Any column wider than `maxColumnWidth` (default 300px) is capped
4. Users can override via `csv-preview.resizeColumns` (set to `"none"` to disable) and `csv-preview.maxColumnWidth`

## Non-Goals

- No changes to manual resize behavior (users can still drag column edges)
- No per-column width configuration
- No changes to the line number column (already has its own fixed width)
- The `wrapText` + auto-size interaction (when `wrapText` is on, `autoSizeAllColumns` measures pre-wrap widths, which may be narrower than ideal) is a known limitation, not addressed here
