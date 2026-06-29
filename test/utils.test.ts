import { describe, it, expect, afterEach } from "vitest";
import * as utils from "../src/utils";

describe("utils", () => {
  describe("getEnvironment", () => {
    const originalEnv = process.env.MARKUPAI_ENV;
    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.MARKUPAI_ENV;
      } else {
        process.env.MARKUPAI_ENV = originalEnv;
      }
    });

    it("returns dev when MARKUPAI_ENV is dev", () => {
      process.env.MARKUPAI_ENV = "dev";
      expect(utils.getEnvironment()).toBe("dev");
    });

    it("defaults to prod when MARKUPAI_ENV is unset", () => {
      delete process.env.MARKUPAI_ENV;
      expect(utils.getEnvironment()).toBe("prod");
    });

    it("falls back to prod for unknown values", () => {
      process.env.MARKUPAI_ENV = "staging";
      expect(utils.getEnvironment()).toBe("prod");
    });

    it("uses the build-time __MARKUPAI_ENV__ when process.env is unset (web host)", () => {
      delete process.env.MARKUPAI_ENV;
      const g = globalThis as Record<string, unknown>;
      g.__MARKUPAI_ENV__ = "dev";
      try {
        expect(utils.getEnvironment()).toBe("dev");
      } finally {
        delete g.__MARKUPAI_ENV__;
      }
    });
  });

  describe("isSupportedScheme", () => {
    it("returns true for supported schemes", () => {
      expect(utils.isSupportedScheme("file")).toBe(true);
      expect(utils.isSupportedScheme("untitled")).toBe(true);
      expect(utils.isSupportedScheme("vscode-vfs")).toBe(true);
      expect(utils.isSupportedScheme("github")).toBe(true);
      expect(utils.isSupportedScheme("vscode-remote")).toBe(true);
      expect(utils.isSupportedScheme("vscode-test-web")).toBe(true);
    });

    it("returns false for unsupported schemes", () => {
      expect(utils.isSupportedScheme("ftp")).toBe(false);
      expect(utils.isSupportedScheme("http")).toBe(false);
      expect(utils.isSupportedScheme("")).toBe(false);
    });
  });
});
