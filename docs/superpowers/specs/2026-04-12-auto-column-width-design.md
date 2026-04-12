# Auto Column Width Design

**Date:** 2026-04-12
**Status:** Approved

## Problem

All columns currently default to the same fixed width. When opening CSV/Excel files with many columns (e.g. 10+), this wastes horizontal space on narrow columns and clips content in wide ones.

## Goal

Columns auto-size to fit their content on load, capped at a configurable maximum width to prevent any single column from dominating the view.

## Approach

Use AG Grid's built-in `autoSizeAllColumns()` — already present but opt-in — as the default behavior. Add a `maxWidth` to `defaultColDef` so AG Grid respects the cap during auto-sizing.

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

### 3. `out/csv.js`

Add to `defaultColDef`:
```js
maxWidth: options.maxColumnWidth || 300
```

### 4. `out/excel.js`

- Read `maxColumnWidth` from options passed by the extension
- Add `maxWidth: options.maxColumnWidth || 300` to `defaultColDef` before calling `autoSizeAllColumns()`

## Behavior After Change

1. File opens → data loads → `onRowDataUpdated` fires → `autoSizeAllColumns()` called
2. AG Grid measures rendered cell content and sets each column width to fit the widest value
3. Any column wider than `maxColumnWidth` (default 300px) is capped
4. Users can override via `csv-preview.resizeColumns` (set to `"none"` to disable) and `csv-preview.maxColumnWidth`

## Non-Goals

- No changes to manual resize behavior (users can still drag column edges)
- No per-column width configuration
- No changes to the line number column (already has its own fixed width)
