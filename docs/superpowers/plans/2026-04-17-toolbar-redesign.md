# Toolbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Reset and Export buttons from the top toolbar to a subtle bottom status bar in the CSV viewer.

**Architecture:** Remove `initToolbar()` entirely; rewrite `initStatusBar()` to build a two-column flex layout with info on the left and action buttons on the right; update all call sites that write to the old flat `#status-bar` element; replace the matching CSS blocks.

**Tech Stack:** Vanilla JS (ES5 compatible, no build step for `out/`), plain CSS, AG Grid Community v32, VS Code webview

---

## File Map

| File | What changes |
|------|-------------|
| `out/csv.js` | Remove `initToolbar()` + call; rewrite `initStatusBar()`, `updateStatusBar()`, `copyToClipboard()`; fix `resizeGrid()` |
| `out/styles/vscode.css` | Remove toolbar CSS; rewrite `#status-bar` block; add new button/layout rules; fix theme overrides |

> **Note:** `out/csv.js` is plain JS served directly to the VS Code webview — no build step, no transpilation. Edit it directly. There is no automated test suite for webview JS; verification is manual via the VS Code extension host.

---

## Task 1: Remove the toolbar CSS

**Files:**
- Modify: `out/styles/vscode.css:28-29` (light theme override)
- Modify: `out/styles/vscode.css:58-59` (dark theme override)
- Modify: `out/styles/vscode.css:293-321` (toolbar + button blocks)

- [ ] **Step 1: Delete the `#toolbar` CSS block (lines 293–303)**

  Find and remove this entire block:
  ```css
  /* CSV Toolbar */
  #toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background-color: var(--vscode-titleBar-activeBackground);
      border-top: 1px solid var(--vscode-tree-indentGuidesStroke);
      flex-shrink: 0;
      height: 32px;
      box-sizing: border-box;
  }
  ```

- [ ] **Step 2: Delete the `#btn-reset-filters` / `#btn-export` CSS blocks (lines 305–321)**

  Find and remove these two blocks:
  ```css
  #btn-reset-filters,
  #btn-export {
      padding: 2px 10px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 12px);
      height: 24px;
      line-height: 1;
  }

  #btn-reset-filters:hover,
  #btn-export:hover {
      background-color: var(--vscode-button-hoverBackground);
  }
  ```

- [ ] **Step 3: Remove `#toolbar` from the light theme override (line 28)**

  Change:
  ```css
  body.csv-theme-light #toolbar,
  body.csv-theme-light #status-bar { background-color: #f3f3f3 !important; border-color: #d4d4d4 !important; color: #1f1f1f !important; }
  ```
  To:
  ```css
  body.csv-theme-light #status-bar { background-color: #f3f3f3 !important; border-color: #d4d4d4 !important; color: #1f1f1f !important; }
  ```

- [ ] **Step 4: Remove `#toolbar` from the dark theme override (line 58)**

  Change:
  ```css
  body.csv-theme-dark #toolbar,
  body.csv-theme-dark #status-bar { background-color: #252526 !important; border-color: #3c3c3c !important; color: #d4d4d4 !important; }
  ```
  To:
  ```css
  body.csv-theme-dark #status-bar { background-color: #252526 !important; border-color: #3c3c3c !important; color: #d4d4d4 !important; }
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add out/styles/vscode.css
  git commit -m "Remove toolbar CSS, clean up theme overrides"
  ```

---

## Task 2: Rewrite the `#status-bar` CSS block

**Files:**
- Modify: `out/styles/vscode.css:279-290` (existing `#status-bar` block)

- [ ] **Step 1: Replace the existing `#status-bar` block**

  Current (lines 279–290):
  ```css
  #status-bar {
      display: flex;
      align-items: center;
      padding: 0 12px;
      background-color: var(--vscode-statusBar-background, #007acc);
      color: var(--vscode-statusBar-foreground, #fff);
      font-family: var(--vscode-font-family);
      font-size: 11px;
      height: 22px;
      flex-shrink: 0;
      box-sizing: border-box;
  }
  ```

  Replace with:
  ```css
  #status-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 3px 10px;
      background-color: var(--vscode-statusBar-background, #252526);
      color: var(--vscode-statusBar-foreground, #cccccc);
      border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
      font-family: var(--vscode-font-family);
      font-size: 11px;
      flex-shrink: 0;
      box-sizing: border-box;
  }

  #status-actions {
      display: flex;
      gap: 4px;
  }

  #btn-reset,
  #btn-export {
      background: transparent;
      border: none;
      color: inherit;
      padding: 1px 7px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
  }

  #btn-reset:hover,
  #btn-export:hover {
      background: var(--vscode-toolbar-hoverBackground, #3c3c3c);
  }
  ```

  Key changes from current:
  - `background-color` fallback: `#007acc` → `#252526`
  - `color` fallback: `#fff` → `#cccccc`
  - `height: 22px` removed (height comes from padding)
  - `justify-content: space-between` added
  - `border-top` added (new property)

- [ ] **Step 2: Commit**
  ```bash
  git add out/styles/vscode.css
  git commit -m "Rewrite status bar CSS with new layout and color tokens"
  ```

---

## Task 3: Remove `initToolbar()` from `out/csv.js`

**Files:**
- Modify: `out/csv.js:525` (call site in `initPage()`)
- Modify: `out/csv.js:679-708` (function body)

- [ ] **Step 1: Delete the `initToolbar()` call in `initPage()` (line 525)**

  Find this line inside `initPage()`:
  ```js
      initToolbar();
  ```
  Delete it. The surrounding `initStatusBar();` call (line 524) stays.

- [ ] **Step 2: Delete the `initToolbar()` function body (lines 679–708)**

  Find and delete this entire function:
  ```js
  function initToolbar() {
      if (document.getElementById('toolbar')) return;
      var toolbar = document.createElement('div');
      toolbar.id = 'toolbar';
      // Insert between #flex and #status-bar (status-bar is already in DOM)
      var statusBar = document.getElementById('status-bar');
      var flex = document.getElementById('flex');
      flex.parentNode.insertBefore(toolbar, statusBar || flex.nextSibling);

      var btnReset = document.createElement('button');
      btnReset.id = 'btn-reset-filters';
      btnReset.textContent = 'Reset Filters';
      btnReset.title = 'Clear all active filters';
      btnReset.addEventListener('click', function() {
          if (gridApi) {
              gridApi.setFilterModel(null);
              updateStatusBar();
          }
      });
      toolbar.appendChild(btnReset);

      var btnExport = document.createElement('button');
      btnExport.id = 'btn-export';
      btnExport.textContent = 'Export CSV';
      btnExport.title = 'Export visible rows to CSV';
      btnExport.addEventListener('click', function() {
          if (gridApi) gridApi.exportDataAsCsv();
      });
      toolbar.appendChild(btnExport);
  }
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add out/csv.js
  git commit -m "Remove initToolbar and its call site"
  ```

---

## Task 4: Rewrite `initStatusBar()` with new DOM structure

**Files:**
- Modify: `out/csv.js:659-666`

- [ ] **Step 1: Replace `initStatusBar()` (lines 659–666)**

  Current:
  ```js
  function initStatusBar() {
      if (document.getElementById('status-bar')) return;
      var bar = document.createElement('div');
      bar.id = 'status-bar';
      bar.textContent = '';
      var flex = document.getElementById('flex');
      flex.parentNode.insertBefore(bar, flex.nextSibling);
  }
  ```

  Replace with:
  ```js
  function initStatusBar() {
      if (document.getElementById('status-info')) return;
      var bar = document.getElementById('status-bar') || document.createElement('div');
      bar.id = 'status-bar';
      bar.innerHTML = '';

      var info = document.createElement('span');
      info.id = 'status-info';
      bar.appendChild(info);

      var actions = document.createElement('span');
      actions.id = 'status-actions';

      var btnReset = document.createElement('button');
      btnReset.id = 'btn-reset';
      btnReset.textContent = '⊘ Reset';
      btnReset.title = 'Clear all active filters';
      btnReset.addEventListener('click', function() {
          if (gridApi) {
              gridApi.setFilterModel(null);
              updateStatusBar();
          }
      });
      actions.appendChild(btnReset);

      var btnExport = document.createElement('button');
      btnExport.id = 'btn-export';
      btnExport.textContent = '↓ Export';
      btnExport.title = 'Export visible rows to CSV';
      btnExport.addEventListener('click', function() {
          if (gridApi) gridApi.exportDataAsCsv();
      });
      actions.appendChild(btnExport);

      bar.appendChild(actions);

      if (!bar.parentNode) {
          var flex = document.getElementById('flex');
          flex.parentNode.insertBefore(bar, flex.nextSibling);
      }
  }
  ```

  Key details:
  - Guard now checks for `#status-info` (the new child), not `#status-bar` — idempotent across refresh messages
  - Reuses existing `#status-bar` element if present (doesn't create a duplicate)
  - Only inserts into DOM if not already there (`!bar.parentNode`)

- [ ] **Step 2: Commit**
  ```bash
  git add out/csv.js
  git commit -m "Rewrite initStatusBar with two-column layout and action buttons"
  ```

---

## Task 5: Rewrite `updateStatusBar()` and fix `copyToClipboard()` + `resizeGrid()`

**Files:**
- Modify: `out/csv.js:668-677` (`updateStatusBar`)
- Modify: `out/csv.js:765-773` (`copyToClipboard`)
- Modify: `out/csv.js:811` (`resizeGrid`)

- [ ] **Step 1: Replace `updateStatusBar()` (lines 668–677)**

  Current:
  ```js
  function updateStatusBar() {
      var bar = document.getElementById('status-bar');
      if (!bar || !gridApi) return;
      var displayed = 0;
      gridApi.forEachNodeAfterFilter(function() { displayed++; });
      var total = sourceData.length;
      bar.textContent = displayed === total
          ? total + ' rows'
          : 'Showing ' + displayed + ' of ' + total + ' rows';
  }
  ```

  Replace with:
  ```js
  function updateStatusBar() {
      var info = document.getElementById('status-info');
      if (!info || !gridApi) return;
      var displayed = 0;
      gridApi.forEachNodeAfterFilter(function() { displayed++; });
      var total = sourceData.length;
      var cols = (gridApi.getColumns() || []).filter(function(c) {
          return c.getColId() !== '__lineNum';
      }).length;
      var rowText = displayed === total
          ? total.toLocaleString() + ' rows'
          : 'Showing ' + displayed.toLocaleString() + ' of ' + total.toLocaleString() + ' rows';
      info.textContent = rowText + ' · ' + cols + ' cols';
  }
  ```

  Changes:
  - Targets `#status-info` span instead of `bar.textContent` (which would clobber buttons)
  - Adds column count via `gridApi.getColumns()` filtered to exclude `__lineNum`
  - Uses `toLocaleString()` for formatted numbers

- [ ] **Step 2: Fix `copyToClipboard()` (lines 765–773)**

  Current:
  ```js
  function copyToClipboard(text, feedback) {
      navigator.clipboard.writeText(text).then(function() {
          var bar = document.getElementById('status-bar');
          if (bar) {
              bar.textContent = feedback;
              setTimeout(updateStatusBar, 2000);
          }
      }).catch(function() {});
  }
  ```

  Replace the inner `.then` body with:
  ```js
  function copyToClipboard(text, feedback) {
      navigator.clipboard.writeText(text).then(function() {
          var info = document.getElementById('status-info');
          if (info) {
              info.textContent = feedback;
              setTimeout(updateStatusBar, 2000);
          }
      }).catch(function() {});
  }
  ```

  This targets `#status-info` so the feedback message doesn't clobber the Reset/Export buttons.

- [ ] **Step 3: Fix `resizeGrid()` (line 811)**

  Current:
  ```js
  ['toolbar', 'status-bar'].forEach(function(id) {
  ```

  Change to:
  ```js
  ['status-bar'].forEach(function(id) {
  ```

  Removing `'toolbar'` is the only change needed — `#status-bar` height is read dynamically via `offsetHeight`, which correctly reflects the padding-based height.

- [ ] **Step 4: Commit**
  ```bash
  git add out/csv.js
  git commit -m "Rewrite updateStatusBar, fix copyToClipboard and resizeGrid"
  ```

---

## Task 6: Manual verification

No automated test suite exists for the webview JS. Verify by running the extension in VS Code.

- [ ] **Step 1: Build and launch**
  ```bash
  npm run compile
  ```
  Then press `F5` in VS Code to open the Extension Development Host.

- [ ] **Step 2: Open a CSV file and verify the status bar**
  - Open any `.csv` file
  - Confirm: no toolbar above the grid
  - Confirm: status bar at the bottom shows e.g. `42 rows · 5 cols`
  - Confirm: `⊘ Reset` and `↓ Export` buttons are visible on the right side
  - Confirm: grid fills the full height between titlebar and status bar

- [ ] **Step 3: Verify Reset Filters**
  - Click a column header to apply a filter
  - Confirm status bar updates to `Showing X of Y rows · Z cols`
  - Click `⊘ Reset` — confirm filter clears and row count returns to total

- [ ] **Step 4: Verify Export**
  - Click `↓ Export`
  - Confirm a `.csv` file is downloaded

- [ ] **Step 5: Verify clipboard feedback**
  - Select a cell and press `Ctrl+C` (or `Cmd+C`)
  - Confirm `#status-info` briefly shows the copy feedback message, then restores the row/col count after 2 seconds
  - Confirm the Reset and Export buttons remain visible throughout

- [ ] **Step 6: Verify themes**
  - Open VS Code settings and switch to a light theme
  - Confirm status bar shows light background (`#f3f3f3`) with dark text
  - Switch back to a dark theme and confirm it reverts

- [ ] **Step 7: Verify Excel viewer is unaffected**
  - Open a `.xlsx` file
  - Confirm sheet tabs still appear at the bottom, unchanged

- [ ] **Step 8: Final commit if any fixes were made during verification**
  ```bash
  git add out/csv.js out/styles/vscode.css
  git commit -m "Fix issues found during manual verification"
  ```
