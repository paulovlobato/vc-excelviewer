var sendMessage;
var gridApi;
var vsCodeApi;          // single instance — acquireVsCodeApi() can only be called once
var workbook = null;
var currentSheetIndex = 0;
var undoStack = [];
var redoStack = [];

function getBinding(n) {
    var h1 = Math.floor(n / 26);
    var h2 = n % 26;
    if (h1 > 0) {
        return String.fromCharCode(64 + h1) + String.fromCharCode(65 + h2);
    } else {
        return String.fromCharCode(65 + h2);
    }
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
            colDef.comparator = function(valA, valB) { return Number(valA) - Number(valB); };
        }
        colDefs.push(colDef);
    }

    return { colDefs: colDefs, rowData: rowData };
}

function gridDataToSheet() {
    if (!gridApi) return null;
    var colDefs = gridApi.getColumnDefs().filter(function(c) { return c.field && !c.field.startsWith('__'); });
    var aoa = [];
    gridApi.forEachNode(function(node) {
        var row = colDefs.map(function(c) {
            var val = node.data[c.field];
            return val !== undefined ? val : '';
        });
        aoa.push(row);
    });
    return XLSX.utils.aoa_to_sheet(aoa);
}

function saveCurrentSheetToWorkbook() {
    if (!workbook || !gridApi) return;
    var sheetName = workbook.SheetNames[currentSheetIndex];
    if (!sheetName) return;
    var ws = gridDataToSheet();
    if (ws) workbook.Sheets[sheetName] = ws;
}

function snapshotWorkbook() {
    if (!workbook) return null;
    var snapshot = { sheetIndex: currentSheetIndex, sheets: {} };
    workbook.SheetNames.forEach(function(name) {
        var ws = workbook.Sheets[name];
        snapshot.sheets[name] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    });
    return snapshot;
}

function applySnapshot(snapshot) {
    if (!snapshot || !workbook) return;
    workbook.SheetNames.forEach(function(name) {
        if (snapshot.sheets[name]) {
            workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(snapshot.sheets[name]);
        }
    });
    loadSheet(snapshot.sheetIndex);
}

function loadSheet(index) {
    if (!workbook || !gridApi) return;
    currentSheetIndex = index;
    var sheetName = workbook.SheetNames[index];
    if (!sheetName) return;
    var ws = workbook.Sheets[sheetName];
    var result = sheetToGridData(ws);

    gridApi.updateGridOptions({
        columnDefs: result.colDefs,
        rowData: result.rowData
    });
    gridApi.hideOverlay();

    updateTabs();
    setTimeout(function() {
        if (result.colDefs.length > 0) gridApi.autoSizeAllColumns();
    }, 50);
}

function updateTabs() {
    if (!workbook) return;
    var tabBar = document.getElementById('sheet-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = '';
    workbook.SheetNames.forEach(function(name, i) {
        var tab = document.createElement('button');
        tab.textContent = name;
        tab.className = 'sheet-tab' + (i === currentSheetIndex ? ' active' : '');
        tab.addEventListener('click', function() {
            if (i === currentSheetIndex) return;
            saveCurrentSheetToWorkbook();
            loadSheet(i);
        });
        tabBar.appendChild(tab);
    });
}

function getState() {
    var options = getOptions();
    return {
        uri: options.uri,
        previewUri: options.previewUri,
        selectedSheetIndex: currentSheetIndex,
        version: "5.0.0"
    };
}

function doPreserveState() {
    if (!vsCodeApi) return;
    var state = getState();
    vsCodeApi.setState(state);
    vsCodeApi.postMessage({ save: true, state: state });
}

function initPage() {
    vsCodeApi = acquireVsCodeApi();   // called exactly once here
    var options = getOptions();
    sendMessage = vsCodeApi.postMessage.bind(vsCodeApi);

    function applyState() {
        if (ignoreState()) return;
        var json = vsCodeApi.getState() || options.state;
        if (json && json.version && json.version >= "5.0.0") {
            if (json.selectedSheetIndex >= 0 && workbook
                && json.selectedSheetIndex < workbook.SheetNames.length) {
                saveCurrentSheetToWorkbook();
                loadSheet(json.selectedSheetIndex);
            }
        }
    }

    var gridOptions = {
        columnDefs: [],
        rowData: [],
        defaultColDef: {
            sortable: true,
            filter: true,
            resizable: true,
            editable: options.customEditor,
            minWidth: 40,
            maxWidth: options.maxColumnWidth != null ? options.maxColumnWidth : 300
        },
        rowHeight: 28,
        suppressScrollOnNewData: true,
        stopEditingWhenCellsLoseFocus: true,
        onCellValueChanged: function() {
            if (!options.customEditor) return;
            vsCodeApi.postMessage({ changed: true, reason: "Cell Edited" });
            doPreserveState();
        },
        onCellEditingStarted: function() {
            saveCurrentSheetToWorkbook();
            var snap = snapshotWorkbook();
            if (snap) {
                undoStack.push(snap);
                if (undoStack.length > 50) undoStack.shift();
                redoStack = [];
            }
        },
        onColumnResized: function(e) { if (e.finished) doPreserveState(); },
        onSortChanged: function() { doPreserveState(); },
        onFilterChanged: function() { doPreserveState(); },
        onGridReady: function() {
            vsCodeApi.postMessage({ refresh: true });
        }
    };

    var container = document.getElementById('sheet');
    gridApi = agGrid.createGrid(container, gridOptions);

    container.addEventListener('contextmenu', function(e) {
        if (!options.customEditor) { e.preventDefault(); e.stopPropagation(); }
    }, true);
}

function resizeSheet() {
    var options = getOptions();
    var bubble = document.getElementById('aboutInfo');
    var tabBar = document.getElementById('sheet-tabs');
    var tabHeight = tabBar ? (tabBar.offsetHeight || 32) : 32;
    var heightOffset = tabHeight;

    var sheetDiv = document.getElementById('sheet');
    if (sheetDiv) {
        sheetDiv.style.height = (window.innerHeight - heightOffset) + "px";
    }
}

function handleEvents() {
    window.addEventListener("message", function(event) {
        // vsCodeApi is set by initPage() which runs before any messages arrive
        if (event.data.refresh) {
            var data = event.data.content.data || event.data.content;
            workbook = XLSX.read(new Uint8Array(data), { type: 'array', cellFormula: false, cellHTML: false });
            undoStack = [];
            redoStack = [];
            currentSheetIndex = 0;

            var json = vsCodeApi.getState() || getOptions().state;
            if (json && json.version >= "5.0.0" && json.selectedSheetIndex >= 0
                && json.selectedSheetIndex < workbook.SheetNames.length) {
                currentSheetIndex = json.selectedSheetIndex;
            }

            loadSheet(currentSheetIndex);
            resizeSheet();
        }
        else if (event.data.type === "getData") {
            saveCurrentSheetToWorkbook();
            var bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
            sendMessage({ response: true, requestId: event.data.requestId, body: new Uint8Array(bytes) });
        }
        else if (event.data.undo) {
            if (undoStack.length > 0) {
                saveCurrentSheetToWorkbook();
                var fwd = snapshotWorkbook();
                if (fwd) { redoStack.push(fwd); if (redoStack.length > 50) redoStack.shift(); }
                applySnapshot(undoStack.pop());
                vsCodeApi.postMessage({ changed: true, reason: "Undo" });
            }
        }
        else if (event.data.redo) {
            if (redoStack.length > 0) {
                saveCurrentSheetToWorkbook();
                var bck = snapshotWorkbook();
                if (bck) { undoStack.push(bck); if (undoStack.length > 50) undoStack.shift(); }
                applySnapshot(redoStack.pop());
                vsCodeApi.postMessage({ changed: true, reason: "Redo" });
            }
        }
    });
}
