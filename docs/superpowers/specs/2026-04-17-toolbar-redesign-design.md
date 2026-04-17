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
┌─────────────────────────────────┐
│ data.csv              [🔍 Ctrl+F]│  ← VS Code titlebar (unchanged)
├─────────────────────────────────┤
│                                 │
│          AG Grid                │  ← grid takes full height (no toolbar above)
│                                 │
├─────────────────────────────────┤
│ 1,234 rows · 8 cols  ⊘ Reset ↓ Export │  ← new status bar
└─────────────────────────────────┘
```

### Status Bar

- **Position:** Bottom of the webview, below the grid
- **Background:** `var(--vscode-statusBar-background)` with fallback `#252526`
- **Top border:** `1px solid var(--vscode-panel-border)` with fallback `#3c3c3c`
- **Layout:** flexbox, space-between
  - **Left:** row count + column count (e.g. `1,234 rows · 8 cols`)
  - **Right:** "⊘ Reset" button + "↓ Export" button
- **Button style:** transparent background, no border, `color: var(--vscode-foreground)`, `border-radius: 3px`, hover shows `var(--vscode-toolbar-hoverBackground)`
- **Height:** ~24px (matching existing toolbar height)

### Removal

- `#toolbar` div and `initToolbar()` function in `out/csv.js` are removed
- `#btn-reset-filters` and `#btn-export` are removed from DOM creation
- Corresponding CSS rules in `out/styles/vscode.css` are removed

### New Elements

- `#status-bar` div inserted after `#flex` (the AG Grid container)
- Left span: `#status-info` — populated after grid data loads with row/col counts
- Right span: `#status-actions` — contains two buttons:
  - `#btn-reset` — "⊘ Reset" — clears filter model (same logic as old Reset Filters)
  - `#btn-export` — "↓ Export" — exports CSV (same logic as old Export CSV)

## Files Changed

| File | Change |
|------|--------|
| `out/csv.js` | Remove `initToolbar()`, add `initStatusBar()`, wire row/col count updates |
| `out/styles/vscode.css` | Remove toolbar CSS, add status bar CSS |

## Not Changed

- `out/excel.js` — no toolbar to remove; sheet tabs stay
- `src/csvDocumentView.ts` — HTML template unchanged (toolbar/statusbar created in JS)
- Find bar behavior — unchanged
- All message-passing logic — unchanged
