import { MarkupAIEnvironment } from "./constants";

export const SUPPORTED_SCHEMES = [
  "file",
  "untitled",
  "vscode-vfs",
  "github",
  "vscode-remote",
  // Virtual FS mounted by @vscode/test-web (local web-host testing only; this
  // scheme never appears on real vscode.dev/github.dev, which use vscode-vfs).
  "vscode-test-web",
] as const;

const SUPPORTED_SCHEMES_SET = new Set<string>(SUPPORTED_SCHEMES);

/**
 * Build-time environment override, injected by esbuild (`define` in
 * esbuild.mjs) into the web bundle, which has no `process`. Empty unless the
 * bundle was built with `MARKUPAI_ENV` set, and always empty in production
 * builds.
 */
declare const __MARKUPAI_ENV__: string | undefined;

/**
 * API environment. Production for everyone; `dev` is a development-only
 * override. The Node extension host reads it live from `MARKUPAI_ENV` (toggle
 * without a rebuild); the web (browser) host has no `process`, so it falls back
 * to the value baked in at build time. Intentionally NOT a user-facing setting.
 */
export function getEnvironment(): MarkupAIEnvironment {
  const fromProcess = typeof process === "undefined" ? undefined : process.env.MARKUPAI_ENV;
  const fromBuild = typeof __MARKUPAI_ENV__ === "undefined" ? undefined : __MARKUPAI_ENV__;
  const override = fromProcess ?? fromBuild;
  return override === "dev" ? "dev" : "prod";
}

/**
 * Whether the given URI scheme is supported for content checking.
 */
export function isSupportedScheme(scheme: string): boolean {
  return SUPPORTED_SCHEMES_SET.has(scheme);
}
