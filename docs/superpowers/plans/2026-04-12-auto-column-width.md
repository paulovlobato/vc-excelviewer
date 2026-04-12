# Auto Column Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-size all columns to fit their content on load, capped at a configurable max width (default 300px), for both CSV and Excel viewers.

**Architecture:** AG Grid's built-in `autoSizeAllColumns()` already exists in both viewers. We add a `maxWidth` to `defaultColDef` so the cap is enforced automatically during auto-sizing. We also change the `resizeColumns` default to `"all"` and wire a new `maxColumnWidth` setting through the extension host into both webviews.

**Tech Stack:** TypeScript (extension host, compiled via webpack → `dist/`), vanilla JS (webview files in `out/`, not webpack-processed), AG Grid Community v32, VS Code extension API

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Change `resizeColumns` default; add `maxColumnWidth` setting |
| `src/csvDocumentView.ts` | Pass `maxColumnWidth` in options |
| `src/excelDocumentView.ts` | Pass `maxColumnWidth` in options |
| `out/csv.js` | Add `maxWidth` to `defaultColDef` |
| `out/excel.js` | Add `maxWidth` to `defaultColDef` |

---

## Task 1: Add `maxColumnWidth` setting and change `resizeColumns` default in `package.json`

**Files:**
- Modify: `package.json:316-325`

- [ ] **Step 1: Change `resizeColumns` default**

In `package.json` at line 323, change:
```json
"default": "none",
```
to:
```json
"default": "all",
```

- [ ] **Step 2: Add `maxColumnWidth` setting after the `resizeColumns` block**

After the closing `}` of the `csv-preview.resizeColumns` block (line 325), add:
```json
                "csv-preview.maxColumnWidth": {
                    "type": "number",
                    "default": 300,
                    "description": "Maximum column width in pixels when auto-sizing columns."
                },
```

- [ ] **Step 3: Verify the JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"
```
Expected output: `valid`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Add maxColumnWidth setting, default resizeColumns to all"
```

---

## Task 2: Pass `maxColumnWidth` from CSV extension host to webview

**Files:**
- Modify: `src/csvDocumentView.ts:71-84`

- [ ] **Step 1: Add `maxColumnWidth` to the returned options object**

In `src/csvDocumentView.ts`, the `getOptions()` method returns an object at lines 65-85. Add one line after the `resizeColumns` line (line 71):

```ts
            resizeColumns: <string>config.get("resizeColumns"),
            maxColumnWidth: <number>config.get("maxColumnWidth"),
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run compile
```
Expected: exits with code 0, no errors printed.

- [ ] **Step 3: Commit**

```bash
git add src/csvDocumentView.ts
git commit -m "Pass maxColumnWidth option to CSV webview"
```

---

## Task 3: Pass `maxColumnWidth` from Excel extension host to webview

**Files:**
- Modify: `src/excelDocumentView.ts:25-35`

- [ ] **Step 1: Add `maxColumnWidth` to the returned options object**

In `src/excelDocumentView.ts`, `getOptions()` at lines 25-35 returns an object. Add `maxColumnWidth` after `showInfo`:

```ts
    public getOptions(): any {    
        let viewerConfig = workspace.getConfiguration('excel-viewer');
        let csvConfig = workspace.getConfiguration('csv-preview');

        return {
            customEditor: this.hasCustomEditor,
            uri: this.uri.toString(),
            previewUri: this.previewUri.toString(),
            state: this.state,
            showInfo: <boolean>viewerConfig.get("showInfo"),
            maxColumnWidth: <number>csvConfig.get("maxColumnWidth")
        };
    }
```

Note: `maxColumnWidth` lives in the `csv-preview` namespace (shared UI preference), so we read from a separate `csvConfig` handle. The `workspace` import is already present at line 2 — no new import needed.

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
npm run compile
```
Expected: exits with code 0, no errors printed.

- [ ] **Step 3: Commit**

```bash
git add src/excelDocumentView.ts
git commit -m "Pass maxColumnWidth option to Excel webview"
```

---

## Task 4: Apply `maxWidth` cap in CSV webview

**Files:**
- Modify: `out/csv.js:424-434`

- [ ] **Step 1: Add `maxWidth` to `defaultColDef`**

In `out/csv.js`, the `defaultColDef` object starts at line 424. Add `maxWidth` after the existing `minWidth: 40` line (line 429):

```js
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            editable: options.customEditor,
            minWidth: 40,
            maxWidth: options.maxColumnWidth != null ? options.maxColumnWidth : 300,
            suppressMovable: true,
            cellRenderer: HighlightCellRenderer,
            wrapText: !!options.wrapText,
            autoHeight: !!options.wrapText
        },
```

- [ ] **Step 2: Verify the file is syntactically valid**

```bash
node --check out/csv.js
```
Expected: no output (means no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add out/csv.js
git commit -m "Cap CSV column auto-size width via maxColumnWidth option"
```

---

## Task 5: Apply `maxWidth` cap in Excel webview

**Files:**
- Modify: `out/excel.js:169-175`

- [ ] **Step 1: Add `maxWidth` to `defaultColDef` in `initPage()`**

In `out/excel.js`, `defaultColDef` is inside `gridOptions` in the `initPage()` function at lines 169-175. Add `maxWidth` after `minWidth: 40` (line 174):

```js
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            editable: options.customEditor,
            minWidth: 40,
            maxWidth: options.maxColumnWidth != null ? options.maxColumnWidth : 300
        },
```

Note: `autoSizeAllColumns()` is called in `loadSheet()` at line 110 — a separate function. The `maxWidth` in `defaultColDef` is a grid-level setting that persists across sheet loads, so it is correctly placed here and not adjacent to the `autoSizeAllColumns()` call.

- [ ] **Step 2: Verify the file is syntactically valid**

```bash
node --check out/excel.js
```
Expected: no output (means no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add out/excel.js
git commit -m "Cap Excel column auto-size width via maxColumnWidth option"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Package the extension**

```bash
bunx vsce package
```
Expected: creates a `.vsix` file in the project root.

- [ ] **Step 2: Install and test with CSV**

Install the `.vsix` in VS Code (`Extensions: Install from VSIX...`). Open a CSV file with 10+ columns. Verify:
- Columns auto-size to fit content on load
- No column exceeds ~300px
- Narrow columns (e.g. ID, boolean) are narrow

- [ ] **Step 3: Test with Excel**

Open an `.xlsx` file. Verify same behavior as above.

- [ ] **Step 4: Test `resizeColumns: none` override**

In VS Code settings, set `csv-preview.resizeColumns` to `"none"`. Reopen the CSV file. Columns should no longer auto-size.

- [ ] **Step 5: Test custom `maxColumnWidth`**

Set `csv-preview.maxColumnWidth` to `150` in settings. Reopen the file. No column should exceed ~150px.
