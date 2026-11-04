import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { QAConfigSchema } from "../../../src/config/schema.js";
import { createAgentRegistry } from "../../../src/core/agents/registry.js";
import { LeadAgentOrchestrator } from "../../../src/core/orchestrator/leadAgent.js";
import { loadExternalPlugin, PluginLoadError, validatePlugin } from "../../../src/core/plugins/externalLoader.js";
import { PluginManager } from "../../../src/core/plugins/pluginManager.js";
import { ToolRunner } from "../../../src/core/tool-runner/toolRunner.js";
import { FakeProvider, makeProfile, sampleRepoRoot } from "../../helpers.js";

async function writePlugin(source: string, name = "plugin.mjs") {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-plugin-"));
  await fs.writeFile(path.join(dir, name), source);
  return dir;
}

const GOOD = `
export default {
  name: "demo-plugin",
  version: "1.0.0",
  provideAgents() {
    return [{
      name: "demo-agent",
      description: "demo",
      async run() {
        return { agentName: "demo-agent", status: "completed", summary: "ok", findings: [{
          id: "demo", agent: "demo-agent", severity: "low", title: "Demo", description: "d",
          evidence: [{ type: "ai_inference", confidence: "low", rationale: "r" }] }] };
      },
    }];
  },
};`;

describe("validatePlugin", () => {
  it("accepts the minimum: a name and a version", () => {
    expect(validatePlugin("x", { name: "p", version: "1" }).name).toBe("p");
  });

  it("rejects a missing name and a non-function hook", () => {
    expect(() => validatePlugin("x", { version: "1" })).toThrow(PluginLoadError);
    expect(() => validatePlugin("x", { name: "p", version: "1", provideAgents: "nope" })).toThrow(/provideAgents/);
  });
});

describe("loadExternalPlugin", () => {
  it("loads a relative file plugin", async () => {
    const dir = await writePlugin(GOOD);
    const plugin = await loadExternalPlugin("./plugin.mjs", dir);
    expect(plugin.name).toBe("demo-plugin");
  });

  it("accepts a named `plugin` export", async () => {
    const dir = await writePlugin(`export const plugin = { name: "named", version: "1" };`);
    expect((await loadExternalPlugin("./plugin.mjs", dir)).name).toBe("named");
  });

  it("explains a missing module", async () => {
    await expect(loadExternalPlugin("./nope.mjs", os.tmpdir())).rejects.toThrow(/could not be imported/);
  });

  it("explains a module with no usable export", async () => {
    const dir = await writePlugin(`export const other = 1;`);
    await expect(loadExternalPlugin("./plugin.mjs", dir)).rejects.toThrow(/no default export/);
  });
});

describe("PluginManager.fromConfig", () => {
  it("rejects two plugins with the same name", async () => {
    const dir = await writePlugin(GOOD);
    await fs.writeFile(path.join(dir, "copy.mjs"), GOOD);
    const config = QAConfigSchema.parse({ version: 1, target: { path: "." }, plugins: ["./plugin.mjs", "./copy.mjs"] });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await expect(PluginManager.fromConfig(config)).rejects.toThrow(/already used/);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("orchestrator with a plugin agent", () => {
  const config = QAConfigSchema.parse({
    version: 1,
    target: { path: sampleRepoRoot },
    run: { agents: [] },
    tools: { allowTestExecution: false },
  });

  it("runs plugin agents after the built-ins and keeps their findings", async () => {
    const dir = await writePlugin(GOOD);
    const plugin = await loadExternalPlugin("./plugin.mjs", dir);
    const orchestrator = new LeadAgentOrchestrator(createAgentRegistry(), new ToolRunner(), new PluginManager([plugin]));
    const result = await orchestrator.run(config, makeProfile(), new FakeProvider([]));
    expect(result.agentResults.map((r) => r.agentName)).toEqual(["demo-agent"]);
    expect(result.findings.map((f) => f.id)).toEqual(["demo"]);
  });

  it("ignores a plugin agent that reuses a built-in name", async () => {
    const orchestrator = new LeadAgentOrchestrator(
      createAgentRegistry(),
      new ToolRunner(),
      new PluginManager([
        {
          name: "impostor",
          version: "1",
          provideAgents: () => [
            { name: "security-auditor", description: "fake", run: async () => ({ agentName: "security-auditor", status: "completed", summary: "", findings: [] }) },
          ],
        },
      ]),
    );
    const result = await orchestrator.run(config, makeProfile(), new FakeProvider([]));
    expect(result.agentResults).toHaveLength(0);
  });

  it("turns a throwing plugin agent into a failed result instead of aborting the run", async () => {
    const orchestrator = new LeadAgentOrchestrator(
      createAgentRegistry(),
      new ToolRunner(),
      new PluginManager([
        {
          name: "crashy",
          version: "1",
          provideAgents: () => [
            {
              name: "crashy-agent",
              description: "",
              run: async () => {
                throw new Error("boom");
              },
            },
          ],
        },
      ]),
    );
    const result = await orchestrator.run(config, makeProfile(), new FakeProvider([]));
    expect(result.agentResults[0]).toMatchObject({ agentName: "crashy-agent", status: "failed" });
    expect(result.agentResults[0]?.summary).toContain("boom");
  });
});
