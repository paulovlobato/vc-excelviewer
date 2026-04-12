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
               (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
    });
}
```

- Empty cells excluded from detection
- Returns `false` for all-empty columns (no comparator added)
- Accepts both JS `number` type and numeric strings

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

In `sheetToGridData`, after building `rowData`, detect each column and attach comparator:

```js
var colValues = rowData.map(function(row) { return row[getBinding(c)]; });
if (isNumericColumn(colValues)) {
    colDefs[c].comparator = function(a, b) { return Number(a) - Number(b); };
}
```

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
| Scientific notation (`"1e3"`) | `!isNaN(Number("1e3"))` → `true`, detected as numeric |
