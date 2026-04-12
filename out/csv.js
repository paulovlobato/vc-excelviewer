var sendMessage;
var gridApi;
var sourceData = [];
var MAX_UNIQUE = 500;

// Find & highlight state
var findQuery = '';
var findMatches = [];
var findCurrent = -1;

// Exposed from initPage() so context menu and copy can call it
var preserveStateFn = null;

// Context menu element (module-level so keydown can hide it)
var contextMenuEl = null;

// Defensive timeout — hides overlay if content never arrives
var _hideTimer = null;

function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.style.display = 'none';
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function CombinedFilter() {}

CombinedFilter.prototype.init = function(params) {
    this.params = params;
    this.field = params.colDef.field;
    this.textValue = '';
    // AG Grid spreads filterParams into params directly, so values is at params.values
    this.allValues = params.values || (params.filterParams && params.filterParams.values) || [];
    this.checkedValues = new Set(this.allValues);

    this.eGui = document.createElement('div');
    this.eGui.style.cssText = 'padding:8px;min-width:200px;max-width:300px;font-size:12px;';
    this.eGui.innerHTML =
        '<div style="margin-bottom:6px;">' +
            '<input type="text" placeholder="Contains..." style="width:100%;box-sizing:border-box;' +
            'padding:4px 6px;background:var(--vscode-input-background);' +
            'color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);"/>' +
        '</div>' +
        '<div id="caSetSection" style="border-top:1px solid var(--vscode-editorWidget-border);padding-top:6px;">' +
            '<div style="margin-bottom:4px;">' +
                '<label style="cursor:pointer;display:flex;align-items:center;gap:4px;">' +
                    '<input type="checkbox" id="caSelectAll" checked> <span>(Select All)</span>' +
                '</label>' +
            '</div>' +
            '<div id="caValuesList" style="max-height:180px;overflow-y:auto;"></div>' +
        '</div>';

    this.textInput = this.eGui.querySelector('input[type="text"]');
    this.selectAllEl = this.eGui.querySelector('#caSelectAll');
    this.valuesListEl = this.eGui.querySelector('#caValuesList');
    this.setSectionEl = this.eGui.querySelector('#caSetSection');
    this.visibleValues = this.allValues.slice();
    this.tooManyValues = this.allValues.length > MAX_UNIQUE;

    var self = this;
    this.textInput.addEventListener('input', function() {
        self.textValue = self.textInput.value;
        self.renderValues();
        self.params.filterChangedCallback();
    });
    this.selectAllEl.addEventListener('change', function() {
        var nowChecked = self.selectAllEl.checked;
        self.visibleValues.forEach(function(v) {
            if (nowChecked) { self.checkedValues.add(v); }
            else { self.checkedValues.delete(v); }
        });
        // Update existing checkboxes in-place without rebuilding the list
        var cbs = self.valuesListEl.querySelectorAll('input[type="checkbox"]');
        cbs.forEach(function(cb) { cb.checked = nowChecked; });
        self.selectAllEl.indeterminate = false;
        self.params.filterChangedCallback();
    });

    this.renderValues();
};

CombinedFilter.prototype.renderValues = function() {
    var self = this;
    if (this.tooManyValues) {
        this.setSectionEl.innerHTML =
            '<span style="color:var(--vscode-descriptionForeground);font-style:italic;">' +
            '(' + this.allValues.length + ' unique values \u2014 use text filter above)</span>';
        return;
    }
    var q = this.textValue.toLowerCase();
    this.visibleValues = q
        ? this.allValues.filter(function(v) { return v.toLowerCase().indexOf(q) !== -1; })
        : this.allValues.slice();

    this.valuesListEl.innerHTML = '';
    this.visibleValues.forEach(function(val) {
        var div = document.createElement('div');
        var checked = self.checkedValues.has(val) ? ' checked' : '';
        var display = val === '' ? '(blank)' : escapeHtml(val);
        div.innerHTML = '<label style="cursor:pointer;display:flex;align-items:center;gap:4px;">' +
            '<input type="checkbox"' + checked + '> <span>' + display + '</span></label>';
        var cb = div.querySelector('input');
        cb.addEventListener('change', function() {
            if (cb.checked) { self.checkedValues.add(val); }
            else { self.checkedValues.delete(val); }
            self.syncSelectAll();
            self.params.filterChangedCallback();
        });
        self.valuesListEl.appendChild(div);
    });
    this.syncSelectAll();
};

CombinedFilter.prototype.syncSelectAll = function() {
    if (this.tooManyValues) return;
    var allChecked = this.visibleValues.length > 0 &&
        this.visibleValues.every(function(v) { return this.checkedValues.has(v); }, this);
    var noneChecked = this.visibleValues.every(function(v) { return !this.checkedValues.has(v); }, this);
    this.selectAllEl.checked = allChecked;
    this.selectAllEl.indeterminate = !allChecked && !noneChecked;
};

CombinedFilter.prototype.getGui = function() { return this.eGui; };

CombinedFilter.prototype.isFilterActive = function() {
    if (this.textValue) return true;
    if (!this.tooManyValues && this.checkedValues.size < this.allValues.length) return true;
    return false;
};

CombinedFilter.prototype.doesFilterPass = function(params) {
    var raw = params.data[this.field];
    var val = raw !== null && raw !== undefined ? String(raw) : '';
    if (this.textValue && val.toLowerCase().indexOf(this.textValue.toLowerCase()) === -1) return false;
    if (!this.tooManyValues && this.checkedValues.size < this.allValues.length && !this.checkedValues.has(val)) return false;
    return true;
};

CombinedFilter.prototype.getModel = function() {
    if (!this.isFilterActive()) return null;
    return { textValue: this.textValue, checkedValues: Array.from(this.checkedValues) };
};

CombinedFilter.prototype.setModel = function(model) {
    if (model) {
        this.textValue = model.textValue || '';
        this.checkedValues = new Set(model.checkedValues || this.allValues);
    } else {
        this.textValue = '';
        this.checkedValues = new Set(this.allValues);
    }
    if (this.textInput) this.textInput.value = this.textValue;
    if (this.valuesListEl) this.renderValues();
};

// ── Find & Highlight cell renderer ────────────────────────────────────────────
function HighlightCellRenderer() {}

HighlightCellRenderer.prototype.init = function(params) {
    this.eGui = document.createElement('span');
    this.render(params);
};

HighlightCellRenderer.prototype.render = function(params) {
    // Use the formatted value when available (respects valueFormatter)
    var val = (params.valueFormatted !== undefined && params.valueFormatted !== null)
        ? String(params.valueFormatted)
        : (params.value !== null && params.value !== undefined ? String(params.value) : '');

    if (!findQuery) {
        this.eGui.textContent = val;
        return;
    }

    var q = findQuery.toLowerCase();
    var lower = val.toLowerCase();
    var html = '';
    var i = 0;
    while (i < val.length) {
        var idx = lower.indexOf(q, i);
        if (idx === -1) { html += escapeHtml(val.slice(i)); break; }
        html += escapeHtml(val.slice(i, idx));
        html += '<mark class="find-highlight">' + escapeHtml(val.slice(idx, idx + q.length)) + '</mark>';
        i = idx + q.length;
    }
    this.eGui.innerHTML = html;
};

HighlightCellRenderer.prototype.refresh = function(params) {
    this.render(params);
    return true;
};

HighlightCellRenderer.prototype.getGui = function() { return this.eGui; };

// ── Find bar functions ─────────────────────────────────────────────────────────
function initFindBar() {
    if (document.getElementById('find-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'find-bar';
    bar.innerHTML =
        '<input id="find-input" type="text" placeholder="Find in table…" autocomplete="off" spellcheck="false">' +
        '<span id="find-count"></span>' +
        '<button id="find-prev" title="Previous (Shift+Enter)">↑</button>' +
        '<button id="find-next" title="Next (Enter)">↓</button>' +
        '<button id="find-close" title="Close (Escape)">✕</button>';
    document.body.appendChild(bar);

    var input = document.getElementById('find-input');
    input.addEventListener('input', function() {
        findQuery = input.value;
        updateFind();
    });
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateFind(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            closeFindBar();
        }
    });
    document.getElementById('find-prev').addEventListener('click', function() { navigateFind(-1); });
    document.getElementById('find-next').addEventListener('click', function() { navigateFind(1); });
    document.getElementById('find-close').addEventListener('click', closeFindBar);
}

function openFindBar() {
    if (!document.getElementById('find-bar')) initFindBar();
    var bar = document.getElementById('find-bar');
    bar.classList.add('visible');
    var input = document.getElementById('find-input');
    input.focus();
    input.select();
}

function closeFindBar() {
    var bar = document.getElementById('find-bar');
    if (bar) bar.classList.remove('visible');
    findQuery = '';
    findMatches = [];
    findCurrent = -1;
    var input = document.getElementById('find-input');
    if (input) input.value = '';
    if (gridApi) gridApi.refreshCells({ force: true });
    updateFindCount();
}

function updateFind() {
    findMatches = [];
    findCurrent = -1;

    if (findQuery && gridApi) {
        var q = findQuery.toLowerCase();
        var cols = (gridApi.getColumns() || []).filter(function(c) { return c.getColId() !== '__lineNum'; });

        gridApi.forEachNodeAfterFilter(function(node) {
            if (!node.data) return;
            cols.forEach(function(col) {
                var colId = col.getColId();
                var val = node.data[colId];
                var str = val !== null && val !== undefined ? String(val) : '';
                if (str.toLowerCase().indexOf(q) !== -1) {
                    findMatches.push({ node: node, colId: colId });
                }
            });
        });

        if (findMatches.length > 0) {
            findCurrent = 0;
            scrollToMatch(0);
        }
    }

    if (gridApi) gridApi.refreshCells({ force: true });
    updateFindCount();
}

function navigateFind(dir) {
    if (!findMatches.length) return;
    findCurrent = (findCurrent + dir + findMatches.length) % findMatches.length;
    scrollToMatch(findCurrent);
    updateFindCount();
}

function scrollToMatch(idx) {
    if (!findMatches.length || !gridApi) return;
    var m = findMatches[idx];
    gridApi.ensureIndexVisible(m.node.rowIndex, 'middle');
    gridApi.ensureColumnVisible(m.colId);
    gridApi.flashCells({ rowNodes: [m.node], columns: [m.colId], flashDuration: 700 });
}

function updateFindCount() {
    var el = document.getElementById('find-count');
    if (!el) return;
    if (!findQuery) {
        el.textContent = '';
        el.classList.remove('no-results');
    } else if (findMatches.length === 0) {
        el.textContent = 'No results';
        el.classList.add('no-results');
    } else {
        el.textContent = (findCurrent + 1) + ' / ' + findMatches.length;
        el.classList.remove('no-results');
    }
}

function initPage() {
    const vscode = acquireVsCodeApi();
    const options = getOptions();
    const NEWLINES = "__newlines";
    sendMessage = vscode.postMessage;

    function countNewlines(obj) {
        var count = 0;
        Object.keys(obj).forEach(function(key) {
            if (key.startsWith('__')) return;
            var value = obj[key];
            if (typeof value === 'string') {
                count += value.split("\n").length - 1;
            }
        });
        return count;
    }

    function getRowRange(dataItem) {
        var sourceIndex = sourceData.indexOf(dataItem);
        var rangeStart = sourceIndex;
        for (var i = 0; i < sourceIndex; i++) {
            rangeStart += (sourceData[i][NEWLINES] || 0);
        }
        var rangeEnd = rangeStart + (dataItem[NEWLINES] || 0) + 1;
        dataItem[NEWLINES] = countNewlines(dataItem);
        return { start: rangeStart, end: rangeEnd };
    }

    function bindingToIndex(binding) {
        if (binding.length === 1) {
            return binding.charCodeAt(0) - 65;
        }
        return (binding.charCodeAt(0) - 64) * 26 + (binding.charCodeAt(1) - 65);
    }

    function toHeaderCase(text) {
        return text.replace(/(\b\w)/g, function(ch) { return ch.toUpperCase(); });
    }

    function formatNumber(value, format) {
        if (typeof value !== 'number' || !format) return value;
        var match = /^([gnf])(\d+)$/i.exec(format);
        if (!match) return value;
        var type = match[1].toLowerCase();
        var digits = parseInt(match[2]);
        if (type === 'g') return parseFloat(value.toPrecision(digits)).toString();
        if (type === 'n' || type === 'f') return value.toFixed(digits);
        return String(value);
    }

    function getState() {
        var state = {
            uri: options.uri,
            previewUri: options.previewUri,
            languageId: options.languageId,
            version: "5.0.0"
        };
        if (gridApi) {
            state.columnState = gridApi.getColumnState();
            state.filterModel = gridApi.getFilterModel();
        }
        return state;
    }

    function preserveState() {
        var state = getState();
        vscode.setState(state);
        vscode.postMessage({ save: true, state: state });
    }
    preserveStateFn = preserveState;

    function applyState() {
        if (ignoreState()) return;
        var json = vscode.getState() || options.state;
        if (!json || !json.version || json.version < "5.0.0") return;
        if (json.columnState) {
            gridApi.applyColumnState({ state: json.columnState, applyOrder: true });
        }
        if (json.filterModel) {
            gridApi.setFilterModel(json.filterModel);
        }
    }

    var numbersOrdinal = options.lineNumbers === "ordinal";
    var numbersSource = options.lineNumbers === "source";
    var lineNumbers = numbersOrdinal || numbersSource;

    var lineNumColDef = null;
    if (lineNumbers) {
        lineNumColDef = {
            headerName: '',
            colId: '__lineNum',
            width: 55,
            minWidth: 40,
            maxWidth: 80,
            sortable: false,
            filter: false,
            editable: false,
            resizable: false,
            suppressMovable: true,
            cellStyle: { color: 'var(--vscode-editorLineNumber-foreground)', textAlign: 'right' },
            valueGetter: numbersSource
                ? function(params) {
                    var idx = sourceData.indexOf(params.data);
                    return idx >= 0 ? idx + 1 : '';
                  }
                : function(params) { return params.node.rowIndex + 1; }
        };
    }

    var gridOptions = {
        columnDefs: lineNumColDef ? [lineNumColDef] : [],
        rowData: [],
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
        rowHeight: options.wrapText ? undefined : 28,
        rowBuffer: 20,
        suppressScrollOnNewData: true,
        stopEditingWhenCellsLoseFocus: true,
        // Editor mode: object API so we can disable click-to-select (clicks start editing instead)
        // Viewer mode: legacy string form — no checkbox column, click selects rows
        rowSelection: 'multiple',
        onColumnResized: function(e) {
            if (e.finished) preserveState();
        },
        onSortChanged: function() { preserveState(); },
        onFilterChanged: function() { preserveState(); updateStatusBar(); updateFind(); },
        onBodyScrollEnd: function() { preserveState(); },
        onCellValueChanged: function(params) {
            if (!options.customEditor) return;
            var field = params.column.getColId();
            var colIdx = bindingToIndex(field);
            var range = getRowRange(params.data);
            var newVal = params.newValue !== undefined && params.newValue !== null
                ? String(params.newValue) : '';
            vscode.postMessage({ cellEditEnded: true, rows: range, col: colIdx, value: newVal });
            vscode.postMessage({ rowEditEnded: true, cancel: false });
            preserveState();
        },
        onCellKeyDown: options.customEditor ? function(params) {
            if (params.event.key !== 'Delete') return;
            if (gridApi.getEditingCells().length > 0) return;
            var selected = gridApi.getSelectedRows();
            if (selected.length === 0) return;
            var sourceRows = selected.map(function(data) { return getRowRange(data); });
            selected.forEach(function(data) {
                var idx = sourceData.indexOf(data);
                if (idx >= 0) sourceData.splice(idx, 1);
            });
            gridApi.setGridOption('rowData', sourceData.slice());
            vscode.postMessage({ deleteRows: true, rows: sourceRows });
            preserveState();
        } : undefined,
        onRowDataUpdated: function() {
            // Do NOT call applyState() here — applying a stale stored filter model
            // immediately after setGridOption('rowData') would hide all rows.
            // applyState() is called in onFirstDataRendered instead.
            preserveState();
        },
        onFirstDataRendered: function() {
            // Apply saved column/filter state only after the first rows are actually
            // painted — prevents stale filter models from immediately hiding all rows.
            applyState();
            // Auto-size AFTER applyState so we always win over any saved uniform widths.
            // At this point rows are in the DOM, so AG Grid can measure text widths correctly.
            var resize = options.resizeColumns;
            if (resize === 'all') {
                gridApi.autoSizeAllColumns();
            } else if (resize === 'first') {
                var cols = gridApi.getColumns();
                if (cols && cols.length > 0) {
                    var first = lineNumColDef ? cols[1] : cols[0];
                    if (first) gridApi.autoSizeColumns([first.getId()]);
                }
            }
        },
        onGridReady: function() {
            _hideTimer = setTimeout(function() { if (gridApi) gridApi.hideOverlay(); }, 5000);
            vscode.postMessage({ refresh: true });
        }
    };

    var container = document.getElementById('flex');
    gridApi = agGrid.createGrid(container, gridOptions);

    // Apply theme override — 'auto' lets vscode.css handle it via --vscode-* variables
    if (options.theme === 'light') {
        document.body.classList.add('csv-theme-light');
    } else if (options.theme === 'dark') {
        document.body.classList.add('csv-theme-dark');
    }

    initStatusBar();
    initToolbar();
    initContextMenu();

    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openFindBar();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            if (gridApi) {
                e.preventDefault();
                copyRowsToClipboard();
            }
        } else if (e.key === 'Escape') {
            closeFindBar();
            hideContextMenu();
        }
    });
}

function parseContent(text) {
    const options = getOptions();
    var sep = options.separator;
    var quote = options.quoteMark;
    var hasHeaders = options.hasHeaders;
    var comment = options.commentCharacter;
    var skip = options.skipComments;
    var formatAlways = options.formatValues === "always";
    var formatUnquoted = options.formatValues === "unquoted";
    var format = options.numberFormat;

    var regexQuote = new RegExp('^' + quote + '([\\S\\s]*)' + quote + '$');
    var regexDoubleQuote = new RegExp(quote + quote, 'g');
    var regexComment = new RegExp(String.raw`^\s*${comment}|^\s+$`);
    var regexLines = new RegExp('((' + quote + '(?:[^' + quote + ']|)+' + quote + '|[^' + quote + '\n\r]+)+)', 'g');
    var regexItems = new RegExp(sep + '(?=(?:[^' + quote + ']*' + quote + '[^' + quote + ']*' + quote + ')*[^' + quote + ']*$)');

    function unquote(cell) {
        if (cell.text.length > 0) {
            var match = regexQuote.exec(cell.text);
            if (match) {
                cell.quoted = true;
                return dblquote(match[1]);
            }
        }
        return cell.text;
    }

    function dblquote(text) {
        return text.length > 1 ? text.replace(regexDoubleQuote, quote) : text;
    }

    function isComment(text) {
        return !skip ? false : ((text.length > 0) ? regexComment.exec(text) : true);
    }

    function isSep(text) {
        var line = text.replace(/ /g, "");
        var left = line.slice(0, 4).toLowerCase();
        var result = (left === "sep=");
        if (result && line.length == 5) {
            var escapes = '+*?^$\\.[]{}()|/';
            var char = line.slice(4);
            sep = (escapes.indexOf(char) >= 0) ? '\\'.concat(char) : char;
            regexItems = new RegExp(sep + '(?=(?:[^' + quote + ']*' + quote + '[^' + quote + ']*' + quote + ')*[^' + quote + ']*$)');
            sendMessage({ separator: sep });
        }
        return result;
    }

    function getBinding(n) {
        var h1 = Math.floor(n / 26);
        var h2 = n % 26;
        if (h1 > 0) {
            return String.fromCharCode(64 + h1) + String.fromCharCode(65 + h2);
        } else {
            return String.fromCharCode(65 + h2);
        }
    }

    var data = [], headers = [], bindings = [];
    var lines = text ? text.split(/\r?\n/) : null;
    if (!lines) return { data: data, bindings: bindings };
    var firstLine = hasHeaders;
    var maxLength = 0;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace("\r", "");
        if (i == 0 && isSep(line)) {
            continue;
        }
        if (!isComment(line)) {
            var items = line.split(regexItems);
            if (items.length > maxLength) {
                maxLength = items.length;
            }
            if (firstLine) {
                for (var j = 0; j < items.length; j++) {
                    var cell = { text: items[j] };
                    headers.push(unquote(cell));
                }
                firstLine = false;
            } else {
                var obj = {};
                obj["__newlines"] = line.split("\n").length - 1;
                for (var j = 0; j < items.length; j++) {
                    var cell = { text: items[j], quoted: false };
                    var value = unquote(cell);
                    if (formatAlways || (formatUnquoted && !cell.quoted)) {
                        var num = value.length ? Number(value) : NaN;
                        obj[getBinding(j)] = isNaN(num) ? value : num;
                    } else {
                        obj[getBinding(j)] = value;
                    }
                }
                if (line.length > 0 || (i < lines.length - 1)) {
                    data.push(obj);
                }
            }
        }
    }

    for (var i = 0; i < maxLength; i++) {
        var key = getBinding(i);
        var header = (headers.length > i) ? headers[i] : hasHeaders ? "" : key;
        bindings.push({
            binding: key,
            header: header.length > 0 ? header : " ",
            format: format
        });
    }

    return { data: data, bindings: bindings };
}

function initStatusBar() {
    if (document.getElementById('status-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'status-bar';
    bar.textContent = '';
    var flex = document.getElementById('flex');
    flex.parentNode.insertBefore(bar, flex.nextSibling);
}

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

function initContextMenu() {
    if (document.getElementById('col-context-menu')) return;
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'col-context-menu';
    document.body.appendChild(contextMenuEl);

    function addItem(label, onClick) {
        var item = document.createElement('div');
        item.className = 'ctx-menu-item';
        item.textContent = label;
        item.addEventListener('click', function() {
            onClick();
            hideContextMenu();
        });
        contextMenuEl.appendChild(item);
    }

    document.addEventListener('contextmenu', function(e) {
        var headerCell = e.target.closest && e.target.closest('.ag-header-cell');
        if (!headerCell || !gridApi) { hideContextMenu(); return; }
        var colId = headerCell.getAttribute('col-id');
        if (!colId || colId === '__lineNum') { hideContextMenu(); return; }
        e.preventDefault();

        var col = gridApi.getColumn(colId);
        var pinned = col ? col.getPinned() : null;
        contextMenuEl.innerHTML = '';

        if (pinned !== 'left') {
            addItem('Pin Left', function() {
                gridApi.applyColumnState({ state: [{ colId: colId, pinned: 'left' }] });
                if (preserveStateFn) preserveStateFn();
            });
        }
        if (pinned !== 'right') {
            addItem('Pin Right', function() {
                gridApi.applyColumnState({ state: [{ colId: colId, pinned: 'right' }] });
                if (preserveStateFn) preserveStateFn();
            });
        }
        if (pinned) {
            addItem('Unpin', function() {
                gridApi.applyColumnState({ state: [{ colId: colId, pinned: null }] });
                if (preserveStateFn) preserveStateFn();
            });
        }

        contextMenuEl.style.left = e.pageX + 'px';
        contextMenuEl.style.top = e.pageY + 'px';
        contextMenuEl.style.display = 'block';
    });

    document.addEventListener('click', function() { hideContextMenu(); });
}

function copyToClipboard(text, feedback) {
    navigator.clipboard.writeText(text).then(function() {
        var bar = document.getElementById('status-bar');
        if (bar) {
            bar.textContent = feedback;
            setTimeout(updateStatusBar, 2000);
        }
    }).catch(function() {});
}

function copyRowsToClipboard() {
    if (!gridApi) return;
    var rows = gridApi.getSelectedRows();

    if (!rows || !rows.length) {
        // No rows selected — copy the focused cell value instead
        var focused = gridApi.getFocusedCell();
        if (!focused) return;
        var node = gridApi.getDisplayedRowAtIndex(focused.rowIndex);
        if (!node || !node.data) return;
        var colId = focused.column.getColId();
        var val = node.data[colId];
        var str = val !== null && val !== undefined ? String(val) : '';
        copyToClipboard(str, 'Cell copied to clipboard');
        return;
    }

    var cols = (gridApi.getColumns() || []).filter(function(c) {
        return c.getColId() !== '__lineNum';
    });

    // No header row — just the data values
    var lines = rows.map(function(row) {
        return cols.map(function(col) {
            var v = row[col.getColId()];
            return v !== null && v !== undefined ? String(v) : '';
        }).join('\t');
    });

    copyToClipboard(lines.join('\n'), rows.length + ' row' + (rows.length !== 1 ? 's' : '') + ' copied to clipboard');
}

function resizeGrid() {
    var div = document.getElementById('flex');
    if (!div) return;
    var used = 0;
    ['toolbar', 'status-bar'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) used += el.offsetHeight;
    });
    div.style.height = (window.innerHeight - used) + 'px';
}

function handleEvents() {
    window.addEventListener("message", function(event) {
        if (event.data.refresh) {
            clearTimeout(_hideTimer);
            var content = parseContent(event.data.content);
            sourceData = content.data;

            var colDefs = [];
            // Re-add line number column if needed
            var numbersOrdinal = getOptions().lineNumbers === "ordinal";
            var numbersSource = getOptions().lineNumbers === "source";
            if (numbersOrdinal || numbersSource) {
                colDefs.push({
                    headerName: '',
                    colId: '__lineNum',
                    width: 55,
                    minWidth: 40,
                    maxWidth: 80,
                    sortable: false,
                    filter: false,
                    editable: false,
                    resizable: false,
                    suppressMovable: true,
                    cellStyle: { color: 'var(--vscode-editorLineNumber-foreground)', textAlign: 'right' },
                    valueGetter: numbersSource
                        ? function(params) {
                            var idx = sourceData.indexOf(params.data);
                            return idx >= 0 ? idx + 1 : '';
                          }
                        : function(params) { return params.node.rowIndex + 1; }
                });
            }

            // Pre-compute unique values per column (O(N×C)) for the set filter
            var uniqueMap = {};
            content.bindings.forEach(function(b) { uniqueMap[b.binding] = new Set(); });
            content.data.forEach(function(row) {
                content.bindings.forEach(function(b) {
                    var v = row[b.binding];
                    uniqueMap[b.binding].add(v !== null && v !== undefined ? String(v) : '');
                });
            });
            content.bindings.forEach(function(b) {
                uniqueMap[b.binding] = Array.from(uniqueMap[b.binding]).sort();
            });

            var opts = getOptions();
            content.bindings.forEach(function(b) {
                var headerName = opts.capitalizeHeaders
                    ? b.header.replace(/(\b\w)/g, function(ch) { return ch.toUpperCase(); })
                    : b.header;
                var colDef = {
                    field: b.binding,
                    headerName: headerName,
                    filter: CombinedFilter,
                    filterParams: { values: uniqueMap[b.binding] },
                    resizable: true,
                    sortable: true,
                    suppressMovable: true
                };
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
            });

            // Set columnDefs first, then defer rowData to next tick so AG Grid v32
            // finishes its column-change cycle before receiving row data.
            gridApi.setGridOption('columnDefs', colDefs);
            var _data = content.data;
            setTimeout(function() {
                gridApi.setGridOption('rowData', _data);
                gridApi.hideOverlay();
                initStatusBar();
                resizeGrid();
                updateStatusBar();
            }, 0);
        }
    });
}
