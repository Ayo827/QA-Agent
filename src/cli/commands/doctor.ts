import { Command } from "commander";
import fs from "node:fs/promises";
import { execa } from "execa";
import { loadConfig, ConfigError } from "../../config/loader.js";
import { AnthropicProvider } from "../../core/provider/anthropicProvider.js";
import { MissingApiKeyError } from "../../core/provider/errors.js";
import { logger } from "../ui/logger.js";
import { renderCheckRows, type CheckRow } from "../ui/table.js";
import type { QAConfig } from "../../config/schema.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Sanity-check config, API key, target repo, and local tooling")
    .option("--config <path>", "Path to qa.config.json")
    .option("--live", "Also make a minimal real Anthropic API call to verify the key/model pair", false)
    .action(async (opts) => {
      const rows: CheckRow[] = [];
      let config: QAConfig | undefined;
      let hardFailure = false;

      try {
        config = await loadConfig({ configPath: opts.config });
        rows.push({ label: "qa.config.json is present and valid", ok: true });
      } catch (err) {
        hardFailure = true;
        rows.push({
          label: "qa.config.json is present and valid",
          ok: false,
          detail: err instanceof ConfigError ? [err.message, ...(err.details ?? [])].join(" ") : String(err),
        });
      }

      const apiKeyEnv = config?.ai.apiKeyEnv ?? "ANTHROPIC_API_KEY";
      const hasApiKey = Boolean(process.env[apiKeyEnv]);
      rows.push({
        label: `${apiKeyEnv} is set`,
        ok: hasApiKey,
        detail: hasApiKey ? undefined : `export ${apiKeyEnv} or set it in .env`,
      });
      if (!hasApiKey) hardFailure = true;

      if (config) {
        rows.push({ label: `Target repo exists: ${config.target.path}`, ok: true });

        const scripts = await readTargetScripts(config.target.path);
        for (const key of ["test", "build", "typecheck"] as const) {
          const present = Boolean(scripts?.[key]);
          rows.push({
            label: `Target has a "${key}" script`,
            ok: present ? true : "warn",
            detail: present ? undefined : `no "${key}" script in target package.json — this phase will report as not_configured`,
          });
        }
      }

      const nodeOk = await commandExists("node", ["--version"]);
      rows.push({ label: "node is on PATH", ok: nodeOk, detail: nodeOk ? process.version : undefined });
      if (!nodeOk) hardFailure = true;

      const npmOk = await commandExists("npm", ["--version"]);
      rows.push({ label: "npm is on PATH", ok: npmOk });
      if (!npmOk) hardFailure = true;

      if (opts.live && config) {
        try {
          const provider = AnthropicProvider.fromConfig(config);
          await provider.verifyConnection();
          rows.push({ label: `Live Anthropic API check (model: ${config.ai.model})`, ok: true });
        } catch (err) {
          hardFailure = true;
          rows.push({
            label: `Live Anthropic API check (model: ${config.ai.model})`,
            ok: false,
            detail: err instanceof MissingApiKeyError ? err.message : (err as Error).message,
          });
        }
      }

      logger.heading("qa doctor");
      console.log(renderCheckRows(rows));

      if (hardFailure) {
        logger.error("\nOne or more checks failed.");
        process.exitCode = 1;
      } else {
        logger.success("\nAll checks passed.");
      }
    });
}

async function readTargetScripts(targetPath: string): Promise<Record<string, string> | undefined> {
  try {
    const raw = await fs.readFile(`${targetPath}/package.json`, "utf-8");
    return (JSON.parse(raw).scripts as Record<string, string>) ?? {};
  } catch {
    return undefined;
  }
}

async function commandExists(command: string, args: string[]): Promise<boolean> {
  try {
    await execa(command, args);
    return true;
  } catch {
    return false;
  }
}
