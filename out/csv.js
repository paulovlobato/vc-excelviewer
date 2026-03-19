var sendMessage;
var gridApi;
var sourceData = [];

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
        onFilterChanged: function() { preserveState(); },
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

function resizeGrid() {
    var div = document.getElementById('flex');
    div.style.height = window.innerHeight.toString() + "px";
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

            var opts = getOptions();
            content.bindings.forEach(function(b) {
                var headerName = opts.capitalizeHeaders
                    ? b.header.replace(/(\b\w)/g, function(ch) { return ch.toUpperCase(); })
                    : b.header;
                var colDef = {
                    field: b.binding,
                    headerName: headerName,
                    filter: true,
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
            // Set columnDefs first, then defer rowData to next tick so AG Grid v32
            // finishes its column-change cycle before receiving row data.
            gridApi.setGridOption('columnDefs', colDefs);
            var _data = content.data;
            setTimeout(function() {
                gridApi.setGridOption('rowData', _data);
                gridApi.hideOverlay();
            }, 0);
        }
    });
}
