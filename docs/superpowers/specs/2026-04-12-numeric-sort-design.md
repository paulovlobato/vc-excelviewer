# Numeric Column Sort Detection

**Date:** 2026-04-12
**Status:** Approved

## Problem

AG Grid sorts all column values as strings by default. Columns containing only numbers sort lexicographically (e.g. `1, 10, 2` instead of `1, 2, 10`). This affects both CSV and Excel viewers.

## Goals

- Automatically detect all-numeric columns and apply numeric sorting
- No new settings — always-on, transparent to user
- No changes to filter, display, or edit behavior
- Mixed columns (some numbers, some strings) fall back to string sort (existing behavior)

## Non-Goals

- Sorting mixed columns with numbers first or last
- Detecting date/boolean columns
- Any UI to toggle sort type

## Design

### Detection Function

A shared utility `isNumericColumn(values)` scans all non-empty values in a column:

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

- Empty cells excluded from detection (note: `Number("")` returns `0` not `NaN`, so the `v !== ''` guard is load-bearing)
- Returns `false` for all-empty columns (no comparator added)
- Accepts both JS `number` type and numeric strings
- Uses `isFinite()` instead of `!isNaN()` to exclude `"Infinity"` and `"-Infinity"` from numeric detection — these are not useful numeric sort values

### Comparator

When a column is detected as numeric, a `comparator` is attached to its colDef:

```js
colDef.comparator = function(a, b) { return Number(a) - Number(b); };
```

`Number()` coercion handles both string `"42"` and numeric `42` uniformly.

### CSV (`out/csv.js`)

At colDef build time, after `content.data` is available, detect each column and conditionally attach the comparator:

```js
var colValues = content.data.map(function(row) { return row[b.binding]; });
if (isNumericColumn(colValues)) {
    colDef.comparator = function(a, b) { return Number(a) - Number(b); };
}
```

CSV stores values as strings when `formatValues` is off, so `Number()` coercion is required.

### Excel (`out/excel.js`)

In `sheetToGridData`, detection runs inside the existing `for (var c = 0; c < colCount; c++)` loop, after the colDef is pushed, so `colDefs[c]` is valid:

```js
for (var c = 0; c < colCount; c++) {
    var colDef = {
        field: getBinding(c),
        // ... existing properties ...
    };
    colDefs.push(colDef);
    // rowData is already built above this loop
    var colValues = rowData.map(function(row) { return row[getBinding(c)]; });
    if (isNumericColumn(colValues)) {
        colDef.comparator = function(a, b) { return Number(a) - Number(b); };
    }
}
```

**Note on `var` loop capture:** `colValues` closes over `c` via `getBinding(c)`. Since `var` is function-scoped, `c` inside `rowData.map` will be the value at the time the callback executes — which is fine here because `map` runs synchronously. The `comparator` function does not close over `c` at all (it only uses `a` and `b`), so there is no capture issue.

SheetJS returns native JS `number` for numeric cells — detection handles both cases.

## Affected Files

| File | Change |
|------|--------|
| `out/csv.js` | Add `isNumericColumn`, attach `comparator` in colDef loop |
| `out/excel.js` | Add `isNumericColumn`, attach `comparator` in `sheetToGridData` |

## Edge Cases

| Case | Behavior |
|------|----------|
| All-empty column | No comparator, string sort |
| Mixed (numbers + strings) | No comparator, string sort (existing behavior) |
| Integers stored as strings (`"42"`) | Detected as numeric, sorted correctly |
| Floats (`"3.14"`) | Detected as numeric, sorted correctly |
| Negative numbers (`"-5"`) | Detected as numeric, sorted correctly |
| Scientific notation (`"1e3"`) | `isFinite(Number("1e3"))` → `true`, detected as numeric |
| `"Infinity"` / `"-Infinity"` | `isFinite(Number("Infinity"))` → `false`, treated as string |
| Empty string `""` | Excluded by `v !== ''` guard before `Number()` coercion (`Number("")` = 0) |
