import fs from "node:fs/promises";
import path from "node:path";
import type { FixResult, PatchCheck } from "./fixAgent.js";

const CHECK_LABEL: Record<PatchCheck, string> = {
  applies: "✅ applies cleanly (`git apply --check`)",
  does_not_apply: "❌ does not apply cleanly",
  unchecked: "⚠ not checked",
};

export interface WrittenFixes {
  fixesDir: string;
  indexPath: string;
  patchPaths: string[];
}

const slug = (key: string) => key.replace(/[^a-zA-Z0-9._-]+/g, "_");

/** Writes patches and an index under <reportDir>/fixes/. Never touches the target repository. */
export async function writeFixes(result: FixResult, reportDir: string): Promise<WrittenFixes> {
  const fixesDir = path.join(reportDir, "fixes");
  await fs.mkdir(fixesDir, { recursive: true });

  const patchPaths: string[] = [];
  for (const proposal of result.proposals) {
    const patchPath = path.join(fixesDir, `${slug(proposal.key)}.patch`);
    await fs.writeFile(patchPath, proposal.patch, "utf-8");
    patchPaths.push(patchPath);
  }

  const lines: string[] = [
    "# Proposed fixes",
    "",
    "These patches are proposals. Nothing was applied to the target repository. Review each one, then from the target repo's root run:",
    "",
    "```",
    "git apply --ignore-whitespace <patch>",
    "```",
    "",
    "Then run `qa rerun` to confirm the finding is gone.",
    "",
  ];

  if (result.proposals.length > 0) {
    lines.push("## Patches", "");
    for (const p of result.proposals) {
      lines.push(
        `### [${p.finding.severity}] ${p.finding.title}`,
        "",
        `- Finding: \`${p.key}\``,
        `- Patch: \`fixes/${slug(p.key)}.patch\``,
        `- Files: ${p.files.map((f) => `\`${f}\``).join(", ")}`,
        `- Check: ${CHECK_LABEL[p.check]}`,
        "",
        p.description,
      );
      if (p.checkOutput) lines.push("", "```", p.checkOutput, "```");
      lines.push("");
    }
  }

  if (result.skipped.length > 0) {
    lines.push("## No patch proposed", "");
    for (const s of result.skipped) lines.push(`- [${s.finding.severity}] \`${s.key}\` — ${s.reason}`);
    lines.push("");
  }

  const indexPath = path.join(fixesDir, "index.md");
  await fs.writeFile(indexPath, lines.join("\n"), "utf-8");
  return { fixesDir, indexPath, patchPaths };
}
