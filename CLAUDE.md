# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Markup AI** — the VS Code extension for the Markup AI **sidebar** experience. It opens a
panel from the activity bar that hosts the Markup AI web app in a webview iframe, checks the
active document (or a selection), highlights flagged text in the editor, and applies
suggestions inline.

This is one half of a product split. The **native** experience (inline diagnostics, findings
panel, folder scanner, quick fixes) lives in a separate repo, **Markup AI Lint**
(`markupai/vscode-extension`, namespace `markupai-lint.*`). This repo keeps the `markupai.*`
namespace and the `vscode-markupai` identity. The two can be installed side by side.

## Architecture

The sidebar is a three-layer relay. The hosted app never talks to VS Code directly; every
capability it needs is brokered through the extension host:

```
sidebar iframe  ⇄  webview host script  ⇄  extension host (bridge)
 (hosted app)      (adapter IPC)            (RPC → real document ops)
```

- **`src/extension.ts`** — slim activation. Registers the webview view provider, creates the
  bridge, and tracks the active editor. No commands, no diagnostics, no auth — those don't
  belong to this extension.
- **`src/sidebar/sidebarViewProvider.ts`** — builds the webview HTML: the CSP (must allow
  framing the sidebar origin **and** the Auth0 domain for sign-out), the bootstrap payload,
  and the script tag. Dispatches incoming RPC requests to the bridge.
- **`src/sidebar/sidebarBridge.ts`** — the extension-host implementation of the adapter's
  `PluginInterface` (`getContent`, `getSelectedContent`, `selectContent`, `replaceContent`,
  `replaceMultipleContents`, `openAuthUrl`). Runs every operation against the tracked editor.
- **`src/sidebar/checkSession.ts`** — snapshots the checked content and resolves the app's
  content-relative ranges back to live document offsets, tolerant of edits since the check
  (via `@markupai/format-offset-mapper`).
- **`src/webview/sidebarHost.ts`** — runs in the webview DOM. Mounts the iframe via
  `@markupai/sidebar-adapter` and forwards each `PluginInterface` call to the extension host
  over RPC. Configures `auth: { type: "mediation" }` — sign-in/out happen inside the iframe.
- **`src/webview/rpc.ts`** — RPC message shapes shared by host script and extension host.
- **`src/webview/theme.ts`** — mirrors VS Code's theme into the iframe via `color-scheme`.
- **`src/constants.ts`** — environment URLs (`SIDEBAR_URLS`, `AUTH_URLS`) and the
  `vscode-extension` integration identity used for mediation OAuth.
- **`src/utils.ts`** — small config helpers (`getConfig`, `getEnvironment`, `isSupportedScheme`).
  `getEnvironment` returns `prod` for everyone; `dev` is a development-only override via the
  `MARKUPAI_ENV=dev` environment variable (set when launching the extension host) — it is not a
  user-facing setting.

### Key invariants

- **Auth is the iframe's job.** The extension registers no sign-in command; it only opens the
  Auth0 authorize URL via `vscode.env.openExternal` (`openAuthUrl`). Don't add a native
  sign-in flow here.
- **CSP must frame both the sidebar origin and the Auth0 domain.** Sign-out navigates the
  iframe to Auth0 and back; if the CSP blocks it the panel goes blank.
- **Ranges are content-relative.** The app's ranges are relative to the content it checked,
  not the document. Always resolve them through the active `CheckSession`; surface
  `TextLookupError` when a range can no longer be located rather than editing the wrong text.

## Build, test, and checks

```bash
npm install
npm run compile        # esbuild → out/extension.js, out/web/extension.js, out/webview/sidebarHost.js
npm test               # vitest
npm run type-check     # tsc --noEmit
npm run lint:check     # eslint
npm run format:check   # prettier
npm run package        # vsce → dist/*.vsix
```

`esbuild.mjs` produces three bundles: the Node extension host, the web (browser) extension
host, and the webview IIFE script. The webview script runs in the DOM, not the extension host.

## Conventions

- TypeScript, ESM. Format with Prettier (`prettier-plugin-packagejson` orders `package.json`).
- Tests are Vitest with a hand-written VS Code mock in `test/mocks/vscode.ts` — extend the
  mock rather than reaching for the real `vscode` module.
- Config, command, and view ids use the `markupai.*` namespace (e.g. view `markupai.sidebar`,
  container `markupai-sidebar`). Keep them distinct from the `markupai-lint.*` namespace used by
  the Lint extension so both can coexist.
- The Sonar project for this repo is `markupai_vscode-extension-sidebar`
  (`sonar-project.properties`). `src/extension.ts` and `src/webview/sidebarHost.ts` are
  coverage-excluded — they're activation/DOM glue that isn't meaningfully unit-tested.
