import { describe, it, expect } from "vitest";
import {
  SIDEBAR_URLS,
  AUTH_URLS,
  SIDEBAR_INTEGRATION_NAME,
  SIDEBAR_INTEGRATION_ID,
} from "../src/constants";

describe("constants", () => {
  describe("SIDEBAR_URLS", () => {
    it("defines the prod and dev sidebar URLs", () => {
      expect(SIDEBAR_URLS.prod).toBe("https://sidebar.markup.ai/");
      expect(SIDEBAR_URLS.dev).toBe("https://sidebar.dev.markup.ai/");
    });

    it("only contains prod and dev environments", () => {
      expect(Object.keys(SIDEBAR_URLS).sort((a, b) => a.localeCompare(b))).toEqual(["dev", "prod"]);
    });

    it("uses https for all environments", () => {
      Object.values(SIDEBAR_URLS).forEach((url) => {
        expect(url.startsWith("https://")).toBe(true);
      });
    });
  });

  describe("AUTH_URLS", () => {
    it("defines the prod and dev Auth0 domains", () => {
      expect(AUTH_URLS.prod).toBe("https://auth.markup.ai/");
      expect(AUTH_URLS.dev).toBe("https://auth.dev.markup.ai/");
    });

    it("uses https for all environments", () => {
      Object.values(AUTH_URLS).forEach((url) => {
        expect(url.startsWith("https://")).toBe(true);
      });
    });
  });

  describe("integration identity", () => {
    it("matches the dedicated vscode-extension Auth0 integration", () => {
      expect(SIDEBAR_INTEGRATION_NAME).toBe("vscode-extension");
      expect(SIDEBAR_INTEGRATION_ID).toBe("vscode-extension");
    });
  });
});
