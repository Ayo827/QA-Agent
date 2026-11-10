import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { Finding } from "../evidence/types.js";

interface PatternRule {
  id: string;
  description: string;
  regex: RegExp;
  severity: Finding["severity"];
}

const PATTERN_RULES: PatternRule[] = [
  { id: "aws-access-key-id", description: "AWS access key ID pattern", regex: /AKIA[0-9A-Z]{16}/, severity: "critical" },
  { id: "stripe-live-secret-key", description: "Stripe live secret key pattern", regex: /sk_live_[0-9a-zA-Z]{16,}/, severity: "critical" },
  {
    id: "pem-private-key-header",
    description: "PEM private key block",
    regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    severity: "critical",
  },
  {
    id: "hardcoded-jwt-secret",
    description: "jwt.sign() called with a string literal secret",
    regex: /jwt\.sign\([^)]*,\s*["'`][^"'`]{6,}["'`]/,
    severity: "high",
  },
];

const SCAN_EXTENSIONS = new Set([".js", ".ts", ".mjs", ".cjs", ".json", ".env", ".yml", ".yaml"]);

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#)/;

/** First match that is not on a comment line (a comment that names a PEM header is not a key). */
function firstCodeMatch(content: string, regex: RegExp): RegExpExecArray | undefined {
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = global.exec(content)) !== null) {
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const lineEnd = content.indexOf("\n", match.index);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    if (!COMMENT_LINE.test(line)) return match;
  }
  return undefined;
}

/**
 * Deterministic, non-LLM regex scan for hardcoded secrets across source files (excludes
 * node_modules and anything already flagged as a likely secret FILE by discovery, since those
 * are handled as filename-only hits elsewhere and their contents are never read).
 */
export async function runSecretScan(rootPath: string, excludeRelativePaths: string[]): Promise<Finding[]> {
  const excluded = new Set(excludeRelativePaths.map((p) => path.normalize(p)));
  const entries = await fg(["**/*"], {
    cwd: rootPath,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    followSymbolicLinks: false,
  });

  const findings: Finding[] = [];
  for (const relativePath of entries) {
    if (excluded.has(path.normalize(relativePath))) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(relativePath))) continue;

    let content: string;
    try {
      content = await fs.readFile(path.join(rootPath, relativePath), "utf-8");
    } catch {
      continue;
    }

    const isTestFile = /(^|[\\/])(__tests__|tests?|fixtures?)[\\/]|\.(test|spec)\.[jt]s$/.test(relativePath);
    for (const rule of PATTERN_RULES) {
      const match = firstCodeMatch(content, rule.regex);
      if (!match) continue;
      const lineNumber = content.slice(0, match.index).split("\n").length;
      // Test fixtures routinely sign tokens with throwaway literals: keep them visible, not alarming.
      const severity: Finding["severity"] = isTestFile ? "low" : rule.severity;
      findings.push({
        id: `secret-scan-${rule.id}-${relativePath.replace(/[\\/]/g, "-")}`,
        agent: "security-auditor",
        severity,
        title: `Possible secret: ${rule.description}`,
        description: `A pattern matching "${rule.description}" was found in ${relativePath}.`,
        evidence: [
          {
            type: "tool_execution",
            commandId: "secret-scan",
            exitCode: 0,
            excerpt: `${relativePath}:${lineNumber}: pattern "${rule.id}" matched`,
          },
        ],
        recommendation: "Remove the hardcoded secret, rotate it, and load it from environment/secret manager instead.",
      });
    }
  }
  return findings;
}
