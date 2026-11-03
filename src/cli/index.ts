#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerRunCommand } from "./commands/run.js";
import { registerRerunCommand } from "./commands/rerun.js";
import { registerCompareCommand } from "./commands/compare.js";
import { registerReportCommand } from "./commands/report.js";
import { registerFixCommand } from "./commands/fix.js";
import { registerAgentsCommand } from "./commands/agents.js";

// Best-effort .env load — Node 20.6+ has this natively; silently skip if it's unavailable or
// there's no .env file (env vars set another way, e.g. CI secrets, still work).
try {
  process.loadEnvFile?.();
} catch {
  // no .env file present — fine, env vars may already be set in the shell/CI.
}

const program = new Command();
program.name("qa").description("Autonomous AI Backend QA Engineer").version("0.1.0");

registerInitCommand(program);
registerDoctorCommand(program);
registerRunCommand(program);
registerRerunCommand(program);
registerCompareCommand(program);
registerReportCommand(program);
registerFixCommand(program);
registerAgentsCommand(program);

program.parseAsync(process.argv);
