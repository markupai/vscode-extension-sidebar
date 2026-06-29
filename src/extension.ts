import * as vscode from "vscode";
import { SidebarViewProvider } from "./sidebar/sidebarViewProvider";
import { SidebarBridge } from "./sidebar/sidebarBridge";

// ============================================================================
// Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  const extensionVersion =
    (context.extension.packageJSON as { version?: string }).version ?? "0.0.0";

  // The sidebar is a webview view that hosts the Markup AI app in an iframe.
  // The bridge implements the app's PluginInterface against the active editor;
  // sign-in, sign-out, and style-guide selection all happen inside the iframe.
  const sidebarBridge = new SidebarBridge();
  sidebarBridge.trackEditor(vscode.window.activeTextEditor);

  context.subscriptions.push(
    sidebarBridge,
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      new SidebarViewProvider(context.extensionUri, extensionVersion, sidebarBridge),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      sidebarBridge.handleDocumentClosed(document.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      sidebarBridge.trackEditor(editor);
    }),
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
