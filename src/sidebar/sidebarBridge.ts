import * as vscode from "vscode";
import {
  buildDocumentReference,
  MimeType,
  TextLookupError,
  type ContentInfo,
} from "@markupai/sidebar-adapter";
import { CheckSession, CheckSessionStore, type SpanRange } from "./checkSession";
import { SidebarRpcHandler } from "./sidebarViewProvider";
import { isSupportedScheme } from "../utils";

interface ContentReplacementArg {
  suggestion: string;
  range: SpanRange;
}

/** Prefix `getContent`/`getActiveDocumentReference` compose document references with. */
const DOCUMENT_REFERENCE_PREFIX = "vscode:";

/** Recover the session-store key (document uri string) from a sidebar-supplied documentReference. */
function uriFromDocumentReference(documentReference: string): string {
  return documentReference.startsWith(DOCUMENT_REFERENCE_PREFIX)
    ? documentReference.slice(DOCUMENT_REFERENCE_PREFIX.length)
    : documentReference;
}

/**
 * Extension-host implementation of the sidebar's PluginInterface.
 *
 * Content requests snapshot the active document into a CheckSession;
 * later card interactions (highlight, apply) resolve their ranges through
 * that session against the live document — see checkSession.ts for the
 * resolution tiers. Sidebar-flagged text is shown with an editor
 * decoration (no diagnostics — native-mode underlines stay out of
 * sidebar mode).
 */
export class SidebarBridge implements SidebarRpcHandler, vscode.Disposable {
  private readonly sessions = new CheckSessionStore();
  private lastEditor: vscode.TextEditor | undefined;
  private readonly highlight: vscode.TextEditorDecorationType;

  // Multi-document mode: the sidebar needs to be told when the host's active
  // document changes (see notifyActiveDocumentChanged in the adapter docs).
  private readonly activeDocumentChangedEmitter = new vscode.EventEmitter<string | null>();
  readonly onActiveDocumentChanged = this.activeDocumentChangedEmitter.event;
  private lastNotifiedDocumentReference: string | null = null;

  constructor() {
    this.highlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
      border: "1px solid",
      borderColor: new vscode.ThemeColor("editor.findMatchHighlightBorder"),
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
  }

  /** Track the editor the sidebar operates on (webview focus steals activeTextEditor). */
  trackEditor(editor: vscode.TextEditor | undefined): void {
    if (editor && isSupportedScheme(editor.document.uri.scheme)) {
      this.lastEditor = editor;
    }
    this.emitActiveDocumentChangedIfNeeded();
  }

  /** Update state for a closed document. */
  handleDocumentClosed(uri: vscode.Uri): void {
    const key = uri.toString();
    if (uri.scheme === "untitled") {
      // An untitled document's content is gone for good; nothing to reopen.
      this.sessions.delete(key);
    } else {
      // Keep the session — a later card click reopens the document by URI.
      // Version numbering restarts on reopen, so the session must stop
      // trusting version equality.
      this.sessions.get(key)?.handleDocumentClosed();
    }
    if (this.lastEditor?.document.uri.toString() === key) {
      this.lastEditor = undefined;
    }
    this.emitActiveDocumentChangedIfNeeded();
  }

  /** The sidebar's documentReference for whatever document is currently active, or null. */
  activeDocumentReference(): string | null {
    const editor = this.resolveEditor();
    return editor ? buildDocumentReference("vscode", editor.document.uri.toString()) : null;
  }

  private emitActiveDocumentChangedIfNeeded(): void {
    const reference = this.activeDocumentReference();
    if (reference !== this.lastNotifiedDocumentReference) {
      this.lastNotifiedDocumentReference = reference;
      this.activeDocumentChangedEmitter.fire(reference);
    }
  }

  async handle(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case "getContent":
        return this.getContent(false);
      case "getSelectedContent":
        return this.getContent(true);
      case "getActiveDocumentReference":
        return this.activeDocumentReference();
      case "selectContent":
        return this.selectContent(args[0] as SpanRange, args[1] as string | null | undefined);
      case "replaceContent":
        return this.replaceContent(
          args[0] as string,
          args[1] as SpanRange,
          args[2] as string | null | undefined,
        );
      case "replaceMultipleContents":
        return this.replaceMultipleContents(args[0] as ContentReplacementArg[]);
      case "openAuthUrl": {
        const url = args[0];
        if (typeof url !== "string" || !url.startsWith("https://")) {
          throw new Error("Invalid auth URL");
        }
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return undefined;
      }
      case "copyToClipboard": {
        // The sidebar iframe cannot use the async clipboard API itself:
        // VS Code's Electron permission handler denies clipboard-write to
        // any frame that is not on the vscode-webview:// origin.
        const text = args[0];
        if (typeof text !== "string") {
          throw new TypeError("Invalid clipboard text");
        }
        await vscode.env.clipboard.writeText(text);
        return undefined;
      }
      default:
        throw new Error(`Unsupported sidebar request: ${method}`);
    }
  }

  // ==========================================================================
  // Content
  // ==========================================================================

  private getContent(selectionOnly: boolean): ContentInfo {
    const editor = this.resolveEditor();
    if (!editor) {
      throw new Error("Open a document to check it with MarkupAI.");
    }

    const document = editor.document;
    const fullText = document.getText();

    let baseOffset = 0;
    let content = fullText;
    if (selectionOnly) {
      const selection = editor.selection;
      if (selection.isEmpty) {
        throw new Error("Select some text in the editor first.");
      }
      baseOffset = document.offsetAt(selection.start);
      content = document.getText(selection);
    }

    this.sessions.set(
      new CheckSession(
        document.uri.toString(),
        fullText,
        document.version,
        baseOffset,
        content.length,
      ),
    );

    const fileName = document.uri.path.split("/").pop() || document.uri.path;
    return {
      content,
      // The shared cross-product format is <prefix>:<id>; the uri is the
      // stable identity of a document in VS Code, and a selection reuses the
      // whole document's reference so both spell the same document.
      documentReference: buildDocumentReference("vscode", document.uri.toString()),
      documentName: fileName,
      mimeType: mimeTypeForFileName(fileName),
    };
  }

  private resolveEditor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && isSupportedScheme(active.document.uri.scheme)) {
      return active;
    }
    if (
      this.lastEditor &&
      vscode.window.visibleTextEditors.includes(this.lastEditor) &&
      !this.lastEditor.document.isClosed
    ) {
      return this.lastEditor;
    }
    return undefined;
  }

  // ==========================================================================
  // Highlight (card click)
  // ==========================================================================

  private async selectContent(range: SpanRange, documentReference?: string | null): Promise<void> {
    const { editor, span } = await this.resolveSessionRange(range, documentReference);

    const start = editor.document.positionAt(span.start);
    const end = editor.document.positionAt(span.end);
    const target = new vscode.Range(start, end);

    editor.selection = new vscode.Selection(target.start, target.end);
    editor.revealRange(target, vscode.TextEditorRevealType.InCenter);
    editor.setDecorations(this.highlight, [target]);
  }

  // ==========================================================================
  // Replacement
  // ==========================================================================

  private async replaceContent(
    suggestion: string,
    range: SpanRange,
    documentReference?: string | null,
  ): Promise<void> {
    const { editor, span } = await this.resolveSessionRange(range, documentReference);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      editor.document.uri,
      new vscode.Range(
        editor.document.positionAt(span.start),
        editor.document.positionAt(span.end),
      ),
      suggestion,
    );
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new TextLookupError("The replacement could not be applied.");
    }
    editor.setDecorations(this.highlight, []);
  }

  private async replaceMultipleContents(replacements: ContentReplacementArg[]): Promise<void> {
    if (!Array.isArray(replacements) || replacements.length === 0) {
      return;
    }

    const { session, editor } = await this.requireSession();
    const document = editor.document;
    const currentText = document.getText();

    const resolved: { suggestion: string; span: SpanRange }[] = [];
    let failed = 0;
    for (const replacement of replacements) {
      const span = session.resolveRange(replacement.range, currentText, document.version);
      if (span) {
        resolved.push({ suggestion: replacement.suggestion, span });
      } else {
        failed++;
      }
    }

    if (resolved.length === 0) {
      throw new TextLookupError(
        "None of the suggestions could be located — the document has changed too much. Re-run the check.",
      );
    }

    // Apply bottom-up in one edit so earlier replacements don't shift
    // later offsets; a single undo step reverts the whole batch.
    resolved.sort((a, b) => b.span.start - a.span.start);
    const edit = new vscode.WorkspaceEdit();
    for (const { suggestion, span } of resolved) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)),
        suggestion,
      );
    }
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new TextLookupError("The replacements could not be applied.");
    }
    editor.setDecorations(this.highlight, []);

    if (failed > 0) {
      throw new TextLookupError(
        `${String(failed)} of ${String(replacements.length)} suggestions could not be located and were skipped. Re-run the check for current results.`,
      );
    }
  }

  // ==========================================================================
  // Session helpers
  // ==========================================================================

  /**
   * Resolve the session to act on. `documentReference` (omitted/null means
   * "whichever document was most recently checked") lets the sidebar target
   * a document that isn't the one currently on screen — see the adapter's
   * multi-document docs for `selectContent`/`replaceContent`.
   */
  private async requireSession(
    documentReference?: string | null,
  ): Promise<{ session: CheckSession; editor: vscode.TextEditor }> {
    const session = documentReference
      ? this.sessions.get(uriFromDocumentReference(documentReference))
      : this.sessions.getLatest();
    if (!session) {
      throw new TextLookupError(
        documentReference
          ? "No check has been run for that document."
          : "No check has been run yet.",
      );
    }

    const uri = vscode.Uri.parse(session.uri);
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      throw new TextLookupError(
        "The checked document could not be opened — it may have been moved or deleted. Re-run the check.",
      );
    }
    const editor = await vscode.window.showTextDocument(document, {
      preserveFocus: true,
      preview: false,
    });
    return { session, editor };
  }

  private async resolveSessionRange(
    range: SpanRange,
    documentReference?: string | null,
  ): Promise<{ session: CheckSession; editor: vscode.TextEditor; span: SpanRange }> {
    const { session, editor } = await this.requireSession(documentReference);
    const span = session.resolveRange(range, editor.document.getText(), editor.document.version);
    if (!span) {
      throw new TextLookupError(
        "This text has changed since the check and can no longer be located. Re-run the check.",
      );
    }
    return { session, editor, span };
  }

  dispose(): void {
    this.highlight.dispose();
    this.sessions.clear();
    this.activeDocumentChangedEmitter.dispose();
  }
}

function mimeTypeForFileName(fileName: string): MimeType {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "md":
    case "markdown":
      return MimeType.TEXT_MARKDOWN;
    case "html":
    case "htm":
      return MimeType.TEXT_HTML;
    case "dita":
    case "xml":
      return MimeType.APPLICATION_DITA_XML;
    default:
      return MimeType.TEXT_PLAIN;
  }
}
