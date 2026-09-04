import chalk from "chalk";

export interface CheckRow {
  label: string;
  ok: boolean | "warn";
  detail?: string;
}

/** Renders a simple pass/warn/fail list for `qa doctor` — no table-drawing dependency needed. */
export function renderCheckRows(rows: CheckRow[]): string {
  return rows
    .map((row) => {
      const badge = row.ok === true ? chalk.green("✓") : row.ok === "warn" ? chalk.yellow("⚠") : chalk.red("✗");
      const detail = row.detail ? chalk.dim(` — ${row.detail}`) : "";
      return `  ${badge} ${row.label}${detail}`;
    })
    .join("\n");
}
