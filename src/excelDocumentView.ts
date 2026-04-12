'use strict';
import { window, workspace, WebviewPanel, ExtensionContext, ViewColumn } from 'vscode';
import { URI } from 'vscode-uri';
import BaseDocumentView from './baseDocumentView';
import { ExcelDocument } from './excelEditor';

export default class ExcelDocumentView extends BaseDocumentView {

    static create(context: ExtensionContext, uri: URI, viewColumn: ViewColumn): ExcelDocumentView {
        let preview = new ExcelDocumentView(context, uri);
        preview.scheme = "excel-preview";
        preview.initWebviewPanel(viewColumn);
        preview.initialize();
        return preview;
    }

    static revive(context: ExtensionContext, uri: URI, webviewPanel: WebviewPanel): ExcelDocumentView {
        let preview = new ExcelDocumentView(context, uri);
        preview.scheme = "excel-preview";
        preview.attachWebviewPanel(webviewPanel);
        preview.initialize();
        return preview;
    }

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

    private _document: ExcelDocument;

    public enableEditing(document: ExcelDocument) {
        this._document = document;
        this.webview.onDidReceiveMessage((e) => {
            if (e.changed) {
                this._document.change(e.reason);
            }
        }, this, this._disposables);
    }

    refresh(): void {
        let self = this;
        workspace.fs.readFile(this.uri).then(buffer => {
            self.webview.postMessage({
                refresh: true,
                content: buffer
            })
        }, reason => {
            window.showInformationMessage(reason);
        });
    }

    undo(): void {
        this.webview.postMessage({
            undo: true
        });
    }

    redo(): void {
        this.webview.postMessage({
            redo: true
        });
    }
    
	getHtml(ignoreState: boolean = false): string {
		return `
        <!DOCTYPE html>
        <html>
        <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src data:; img-src data: ${this.webview.cspSource}; style-src ${this.webview.cspSource} 'unsafe-inline'; script-src ${this.webview.cspSource} 'unsafe-inline';">
            <link href="${this.scriptUri}/styles/ag-grid.min.css" rel="stylesheet" type="text/css" />
            <link href="${this.scriptUri}/styles/ag-theme-alpine.min.css" rel="stylesheet" type="text/css" />
            <link href="${this.scriptUri}/styles/vscode.css" rel="stylesheet" type="text/css" />
        </head>
        <script src="${this.scriptUri}/ag-grid-community.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/xlsx.full.min.js" type="text/javascript"></script>
        <script src="${this.scriptUri}/excel.js"></script>
        <body style="padding:0px; overflow:hidden; display:flex; flex-direction:column;" onload="resizeSheet()" onresize="resizeSheet()">
            <div id="sheet-container" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <div id="sheet" class="ag-theme-alpine" style="flex:1; width:100%;"></div>
                <div id="sheet-tabs"></div>
            </div>
        </body>
        <script type="text/javascript">
            function ignoreState() {
                return ${ignoreState};
            }
            function getOptions() {
                return ${JSON.stringify(this.getOptions())};
            }
            resizeSheet();  // set container height BEFORE AG Grid initializes
            handleEvents();
            initPage();
        </script>
        </html>`;
	}

    get viewType(): string {
        return "csv-excel-viewer-excel-preview";
    }

    get configurable(): boolean {
        return false;
    }
}
