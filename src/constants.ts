// ============================================================================
// Environment
// ============================================================================

export type MarkupAIEnvironment = "prod" | "dev";

/** Hosted sidebar app, embedded as an iframe in sidebar mode. */
export const SIDEBAR_URLS: Record<MarkupAIEnvironment, string> = {
  prod: "https://sidebar.markup.ai/",
  dev: "https://sidebar.dev.markup.ai/",
};

/**
 * Auth0 custom domain. Sign-out inside the hosted sidebar navigates the
 * iframe here to clear the Auth0 session, then `returnTo`s back to the
 * sidebar origin — so the webview CSP must allow framing it (otherwise the
 * navigation is blocked and the panel goes blank). Sign-in is mediated via
 * the external browser, so the iframe never navigates here for login.
 */
export const AUTH_URLS: Record<MarkupAIEnvironment, string> = {
  prod: "https://auth.markup.ai/",
  dev: "https://auth.dev.markup.ai/",
};

/**
 * Sidebar integration identity. The sidebar lowercases integrationName to
 * derive its mediation OAuth provider, so it must match the dedicated
 * "vscode-extension" Auth0 integration (registered in helios-core #2402).
 */
export const SIDEBAR_INTEGRATION_NAME = "vscode-extension";
export const SIDEBAR_INTEGRATION_ID = "vscode-extension";
