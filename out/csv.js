var sendMessage;
var gridApi;
var sourceData = [];
var MAX_UNIQUE = 500;

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
            suppressMovable: true
        },
        rowHeight: 28,
        rowBuffer: 20,
        suppressScrollOnNewData: true,
        stopEditingWhenCellsLoseFocus: true,
        rowSelection: options.customEditor
            ? { mode: 'multiRow', enableClickSelection: false }
            : undefined,
        onColumnResized: function(e) {
            if (e.finished) preserveState();
        },
        onSortChanged: function() { preserveState(); },
        onFilterChanged: function() { preserveState(); updateStatusBar(); },
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
            var resize = options.resizeColumns;
            if (resize === 'all') {
                setTimeout(function() { gridApi.autoSizeAllColumns(); }, 0);
            } else if (resize === 'first') {
                setTimeout(function() {
                    var cols = gridApi.getColumns();
                    if (cols && cols.length > 0) {
                        var first = lineNumColDef ? cols[1] : cols[0];
                        if (first) gridApi.autoSizeColumns([first.getId()]);
                    }
                }, 0);
            }
            // Do NOT call applyState() here — applying a stale stored filter model
            // immediately after setGridOption('rowData') would hide all rows.
            // applyState() is called in onFirstDataRendered instead.
            preserveState();
        },
        onFirstDataRendered: function() {
            // Apply saved column/filter state only after the first rows are actually
            // painted — prevents stale filter models from immediately hiding all rows.
            applyState();
        },
        onGridReady: function() {
            vscode.postMessage({ refresh: true });
        }
    };

    var container = document.getElementById('flex');
    gridApi = agGrid.createGrid(container, gridOptions);
    initStatusBar();
    initToolbar();
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
