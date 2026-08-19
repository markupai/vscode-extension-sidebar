/**
 * Sidebar webview script. Runs inside the VS Code webview (DOM context),
 * mounts the hosted MarkupAI sidebar in an iframe via the adapter, and
 * implements the adapter's PluginInterface as RPC stubs that forward each
 * call to the extension host, which performs the real document operations.
 *
 *   sidebar iframe  ⇄  this script (adapter IPC)  ⇄  extension host (RPC)
 */
import {
  assertSidebarHostAdapter,
  createSidebarHost,
  ensureSidebarHostShell,
  sidebarPostMessageTargetOrigin,
  reconstructError,
  type ContentInfo,
  type ContentRange,
  type ContentReplacement,
  type PluginInterface,
  type SidebarConfig,
  type SidebarHost,
} from "@markupai/sidebar-adapter";
import {
  RPC_REQUEST,
  isRpcResponse,
  isRpcNotify,
  RPC_ERROR,
  type RpcNotify,
  type RpcRequest,
  type SidebarBootstrap,
} from "./rpc";
import { SIDEBAR_AUTH_PROVIDER } from "../constants";
import { themeKindToColorScheme } from "./theme";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

declare global {
  var __MARKUPAI_BOOTSTRAP__: SidebarBootstrap | undefined;
}

const vscode = acquireVsCodeApi();
const bootstrap = globalThis.__MARKUPAI_BOOTSTRAP__;

// ============================================================================
// RPC to the extension host
// ============================================================================

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

let nextRpcId = 1;
const pending = new Map<number, Pending>();

/** Set once the sidebar host mounts; used to relay extension-host push notifications. */
let sidebarHost: SidebarHost | undefined;

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  // Messages from the extension host are delivered with this webview's own
  // origin. The sidebar iframe also posts messages to this window (adapter
  // IPC, handled elsewhere) — never parse those as RPC.
  if (event.origin !== globalThis.location.origin) {
    return;
  }
  const data = event.data;
  if (isRpcNotify(data)) {
    handleNotify(data);
    return;
  }
  if (!isRpcResponse(data)) {
    return;
  }
  const entry = pending.get(data.id);
  if (!entry) {
    return;
  }
  pending.delete(data.id);
  if (data.type === RPC_ERROR) {
    entry.reject(reconstructError(data.error));
  } else {
    entry.resolve(data.result);
  }
});

/** Push notifications from the extension host (multi-document mode). */
function handleNotify(notify: RpcNotify): void {
  if (notify.method !== "activeDocumentChanged" || !sidebarHost) {
    return;
  }
  assertSidebarHostAdapter(sidebarHost);
  void sidebarHost.adapter.notifyActiveDocumentChanged(notify.args[0] as string | null);
}

function rpc<T>(method: string, args: unknown[] = []): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextRpcId++;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    const request: RpcRequest = { type: RPC_REQUEST, id, method, args };
    vscode.postMessage(request);
  });
}

async function rpcVoid(method: string, args: unknown[] = []): Promise<void> {
  await rpc<unknown>(method, args);
}

// ============================================================================
// PluginInterface — forwarded to the extension host
// ============================================================================

function buildPlugin(boot: SidebarBootstrap): PluginInterface {
  return {
    getInitConfig: async (): Promise<SidebarConfig> => {
      // One-time snapshot at init — the sidebar's own multi-document doc
      // recommends this over waiting for a passive getContent() detection.
      // Later switches still go through notifyActiveDocumentChanged.
      const initialActiveDocumentReference = await rpc<string | null>("getActiveDocumentReference");
      return {
        integrationName: boot.integrationName,
        integrationId: boot.integrationId,
        integrationVersion: boot.integrationVersion,
        // Popups cannot be created from a VS Code webview; the sidebar must
        // use the backend-mediated OAuth flow with openAuthUrl below. The
        // provider is pinned to the registered Auth0 connection so it no
        // longer derives from integrationId (which uses the analytics slug).
        auth: { type: "mediation", provider: SIDEBAR_AUTH_PROVIDER },
        useCheckPreviewDialog: false,
        supportCheckSelection: true,
        hideBanner: false,
        // VS Code is a tabbed editor — retain each document's check results
        // separately as the user switches between open files.
        multiDocument: true,
        initialActiveDocumentReference,
      };
    },

    getContent: () => rpc<ContentInfo>("getContent"),
    getSelectedContent: () => rpc<ContentInfo>("getSelectedContent"),
    selectContent: (range: ContentRange, documentReference?: string | null) =>
      rpcVoid("selectContent", [range, documentReference ?? null]),
    replaceContent: (suggestion: string, range: ContentRange, documentReference?: string | null) =>
      rpcVoid("replaceContent", [suggestion, range, documentReference ?? null]),
    replaceMultipleContents: (replacements: ContentReplacement[]) =>
      rpcVoid("replaceMultipleContents", [replacements]),

    // The browser hand-off for mediated sign-in: the extension host opens
    // the Auth0 authorize URL via vscode.env.openExternal.
    openAuthUrl: (url: string) => rpcVoid("openAuthUrl", [url]),

    // The sidebar iframe cannot use the async clipboard API itself — VS
    // Code's Electron permission handler denies clipboard-write to frames
    // off the vscode-webview:// origin — so the app delegates the write to
    // the extension host (vscode.env.clipboard).
    copyToClipboard: (text: string) => rpcVoid("copyToClipboard", [text]),

    // VS Code has no host-rendered dialog surface; the sidebar is configured
    // with useCheckPreviewDialog: false so these are never exercised.
    showDialog: () => Promise.reject(new Error("Dialogs are not supported in VS Code")),
    closeDialog: () => Promise.reject(new Error("Dialogs are not supported in VS Code")),
  };
}

// ============================================================================
// Theme sync
// ============================================================================

/**
 * Mirror VS Code's theme into the sidebar. The sidebar's default theme mode
 * is "system" (prefers-color-scheme), and Chromium derives a cross-origin
 * iframe's preferred color scheme from the embedder's `color-scheme` — so
 * setting it here flips the sidebar between light and dark with the editor,
 * observed live so it follows theme switches. An explicit light/dark choice
 * made inside the sidebar still wins, as it should.
 */
function syncVsCodeTheme(iframe: HTMLIFrameElement): void {
  const apply = () => {
    const scheme = themeKindToColorScheme(
      document.body.dataset.vscodeThemeKind ?? "",
      document.body.classList,
    );
    document.documentElement.style.colorScheme = scheme;
    iframe.style.colorScheme = scheme;
  };

  new MutationObserver(apply).observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-vscode-theme-kind"],
  });
  apply();
}

// ============================================================================
// Mount
// ============================================================================

function mount(): void {
  if (!bootstrap) {
    document.body.textContent = "MarkupAI: failed to initialize the sidebar view.";
    return;
  }

  // Creates the container and injects the adapter's full-viewport shell
  // CSS (same shell the Figma plugin UI uses).
  const container = ensureSidebarHostShell();

  const host = createSidebarHost({
    plugin: buildPlugin(bootstrap),
    iframeMount: {
      container,
      src: bootstrap.sidebarUrl,
    },
    loadOverlayContainer: container,
    adapterOptions: {
      targetOrigin: sidebarPostMessageTargetOrigin(bootstrap.sidebarUrl),
    },
  });
  sidebarHost = host;

  syncVsCodeTheme(host.iframe);
}

mount();
