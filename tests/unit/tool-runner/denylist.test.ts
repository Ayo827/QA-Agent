import { describe, expect, it } from "vitest";
import { isUnsafeScript } from "../../../src/core/tool-runner/denylist.js";

describe("isUnsafeScript", () => {
  it.each(["serve", "start", "shell", "deploy", "logs", "dev", "emulators", "emulate"])(
    "flags the unsafe script name %s regardless of its body",
    (name) => {
      expect(isUnsafeScript(name, "echo harmless")).toBe(true);
    },
  );

  it("flags a firebase deploy command body even under a differently-named key", () => {
    expect(isUnsafeScript("release", "firebase deploy --only functions")).toBe(true);
  });

  it("flags a firebase emulators:start command body", () => {
    expect(isUnsafeScript("run-local", "firebase emulators:start --only functions")).toBe(true);
  });

  it("flags nodemon anywhere in the command body", () => {
    expect(isUnsafeScript("watch", "nodemon index.js")).toBe(true);
  });

  it("does not flag lint/format/build/test scripts", () => {
    expect(isUnsafeScript("lint", "eslint .")).toBe(false);
    expect(isUnsafeScript("format:check", "prettier --check \"**/*.js\"")).toBe(false);
    expect(isUnsafeScript("build", "tsc -p tsconfig.json")).toBe(false);
    expect(isUnsafeScript("test", "jest")).toBe(false);
  });
});
