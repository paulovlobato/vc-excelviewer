# Numeric Column Sort Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect all-numeric columns in CSV and Excel viewers and apply numeric comparator so they sort numerically instead of lexicographically.

**Architecture:** Add `isNumericColumn(values)` utility to each webview file. In `csv.js`, call it per column inside the existing `content.bindings.forEach` loop after `content.data` is available. In `excel.js`, swap colDef/rowData build order so rowData exists first, then detect inside the column loop.

**Tech Stack:** Vanilla JS (ES5 `var`-style), AG Grid Community v32, SheetJS v0.18.5, bun test

---

## File Map

| File | Change |
|------|--------|
| `out/csv.js` | Add `isNumericColumn`, attach `comparator` per colDef |
| `out/excel.js` | Add `isNumericColumn`, swap rowData/colDef build order, attach `comparator` |
| `test/numeric-sort.test.js` | New — unit tests for `isNumericColumn` and comparator behavior |

---

### Task 1: Write tests for `isNumericColumn`

**Files:**
- Create: `test/numeric-sort.test.js`

- [ ] **Step 1: Create test file**

```js
// test/numeric-sort.test.js
import { test, expect, describe } from "bun:test";

// Copy of the function under test (same code that will go in csv.js / excel.js)
function isNumericColumn(values) {
    var nonEmpty = values.filter(function(v) {
        return v !== null && v !== undefined && v !== '';
    });
    if (nonEmpty.length === 0) return false;
    return nonEmpty.every(function(v) {
        return typeof v === 'number' ||
               (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)));
    });
}

describe('isNumericColumn', function() {
    test('all integer strings → true', function() {
        expect(isNumericColumn(['1', '2', '10', '100'])).toBe(true);
    });

    test('all float strings → true', function() {
        expect(isNumericColumn(['1.5', '3.14', '-2.7'])).toBe(true);
    });

    test('negative numbers → true', function() {
        expect(isNumericColumn(['-1', '-10', '-100'])).toBe(true);
    });

    test('scientific notation → true', function() {
        expect(isNumericColumn(['1e3', '2.5e-4'])).toBe(true);
    });

    test('native JS number values → true', function() {
        expect(isNumericColumn([1, 2, 3])).toBe(true);
    });

    test('mixed JS numbers and numeric strings → true', function() {
        expect(isNumericColumn([1, '2', 3])).toBe(true);
    });

    test('mixed numbers and non-numeric strings → false', function() {
        expect(isNumericColumn(['1', '2', 'foo'])).toBe(false);
    });

    test('all strings → false', function() {
        expect(isNumericColumn(['foo', 'bar'])).toBe(false);
    });

    test('all empty → false', function() {
        expect(isNumericColumn(['', '', ''])).toBe(false);
    });

    test('empty array → false', function() {
        expect(isNumericColumn([])).toBe(false);
    });

    test('null and undefined excluded, rest numeric → true', function() {
        expect(isNumericColumn([null, undefined, '42', '7'])).toBe(true);
    });

    test('empty string excluded, rest numeric → true', function() {
        expect(isNumericColumn(['', '1', '2'])).toBe(true);
    });

    test('"Infinity" string → false', function() {
        expect(isNumericColumn(['Infinity', '1', '2'])).toBe(false);
    });

    test('"-Infinity" string → false', function() {
        expect(isNumericColumn(['-Infinity', '1'])).toBe(false);
    });

    test('whitespace-only string → false', function() {
        expect(isNumericColumn(['   ', '1'])).toBe(false);
    });

    test('numeric comparator sorts correctly', function() {
        var data = ['10', '2', '1', '20'];
        data.sort(function(a, b) { return Number(a) - Number(b); });
        expect(data).toEqual(['1', '2', '10', '20']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail (function not yet in production files)**

```bash
bun test test/numeric-sort.test.js
```

Expected: all tests PASS (function is defined inline in test file — this validates the logic before we add it to production files)

- [ ] **Step 3: Commit test file**

```bash
git add test/numeric-sort.test.js
git commit -m "Add tests for isNumericColumn utility"
```

---

### Task 2: Add `isNumericColumn` and numeric comparator to `csv.js`

**Files:**
- Modify: `out/csv.js:854-881` (inside `content.bindings.forEach` loop)

The colDef loop lives at ~line 854. `content.data` is available at that point. Detection goes between building `colDef` and `colDefs.push(colDef)`.

- [ ] **Step 1: Add `isNumericColumn` function near top of `out/csv.js`**

Add after the `escapeHtml` function (around line 27):

```js
function isNumericColumn(values) {
    var nonEmpty = values.filter(function(v) {
        return v !== null && v !== undefined && v !== '';
    });
    if (nonEmpty.length === 0) return false;
    return nonEmpty.every(function(v) {
        return typeof v === 'number' ||
               (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)));
    });
}
```

- [ ] **Step 2: Attach comparator inside `content.bindings.forEach` loop**

In `out/csv.js`, find this block (around line 867–881):

```js
                if (b.format) {
                    colDef.valueFormatter = function(params) {
                        // ...
                    };
                }
                colDefs.push(colDef);
```

Add detection between the `if (b.format)` block and `colDefs.push`:

```js
                if (b.format) {
                    colDef.valueFormatter = function(params) {
                        if (typeof params.value === 'number') {
                            var match = /^([gnf])(\d+)$/i.exec(b.format);
                            if (match) {
                                var type = match[1].toLowerCase();
                                var digits = parseInt(match[2]);
                                if (type === 'g') return parseFloat(params.value.toPrecision(digits)).toString();
                                if (type === 'n' || type === 'f') return params.value.toFixed(digits);
                            }
                        }
                        return params.value;
                    };
                }
                var colValues = content.data.map(function(row) { return row[b.binding]; });
                if (isNumericColumn(colValues)) {
                    colDef.comparator = function(a, b) { return Number(a) - Number(b); };
                }
                colDefs.push(colDef);
```

- [ ] **Step 3: Run tests**

```bash
bun test test/numeric-sort.test.js
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add out/csv.js
git commit -m "Detect numeric columns in CSV viewer for correct sort order"
```

---

### Task 3: Add `isNumericColumn` and numeric comparator to `excel.js`

**Files:**
- Modify: `out/excel.js:19-49` (`sheetToGridData` function)

Currently `colDefs` is built (lines 28–39) before `rowData` (lines 41–47). To detect column types we need `rowData` first. Swap the order: build `rowData` first, then build `colDefs` with detection inside the loop.

- [ ] **Step 1: Add `isNumericColumn` function near top of `out/excel.js`**

Add after the `getBinding` function (around line 17):

```js
function isNumericColumn(values) {
    var nonEmpty = values.filter(function(v) {
        return v !== null && v !== undefined && v !== '';
    });
    if (nonEmpty.length === 0) return false;
    return nonEmpty.every(function(v) {
        return typeof v === 'number' ||
               (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)));
    });
}
```

- [ ] **Step 2: Swap `rowData`/`colDefs` build order in `sheetToGridData`**

Replace the entire `sheetToGridData` function body (lines 19–50) with:

```js
function sheetToGridData(ws) {
    if (!ws) return { colDefs: [], rowData: [] };
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!aoa || aoa.length === 0) return { colDefs: [], rowData: [] };

    var colCount = 0;
    aoa.forEach(function(row) { if (row.length > colCount) colCount = row.length; });

    // Build rowData first so detection can scan column values
    var rowData = aoa.map(function(row) {
        var obj = {};
        for (var c = 0; c < colCount; c++) {
            obj[getBinding(c)] = row[c] !== undefined ? row[c] : '';
        }
        return obj;
    });

    var colDefs = [];
    for (var c = 0; c < colCount; c++) {
        var colDef = {
            field: getBinding(c),
            headerName: getBinding(c),
            sortable: true,
            filter: true,
            resizable: true,
            editable: true,
            minWidth: 40,
            suppressMovable: false
        };
        var colValues = rowData.map(function(row) { return row[getBinding(c)]; });
        if (isNumericColumn(colValues)) {
            colDef.comparator = function(a, b) { return Number(a) - Number(b); };
        }
        colDefs.push(colDef);
    }

    return { colDefs: colDefs, rowData: rowData };
}
```

- [ ] **Step 3: Run tests**

```bash
bun test test/numeric-sort.test.js
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add out/excel.js
git commit -m "Detect numeric columns in Excel viewer for correct sort order"
```

---

### Task 4: Manual smoke test

No automated integration test infrastructure exists for the webview. Verify manually:

- [ ] **Step 1: Build extension**

```bash
npm run compile
```

Expected: no errors

- [ ] **Step 2: Test CSV — numeric column**

Open a CSV file with a numeric column containing values like `1, 10, 2, 20`. Click the column header to sort. Expected: `1, 2, 10, 20` (numeric order, not `1, 10, 2, 20`).

- [ ] **Step 3: Test CSV — mixed column**

Open a CSV with a mixed column like `1, foo, 2`. Sort it. Expected: lexicographic order (existing behavior, no regression).

- [ ] **Step 4: Test Excel — numeric column**

Open an `.xlsx` file with a numeric column. Sort it. Expected: numeric order.

- [ ] **Step 5: Test CSV with `formatValues` off (strings)**

In VS Code settings set `csv-preview.formatValues` to `none`. Open numeric CSV, sort. Expected: still numeric order (comparator coerces via `Number()`).

- [ ] **Step 6: Final commit if any fixups needed**

```bash
git add -p
git commit -m "Fix: <describe any fixup>"
```
