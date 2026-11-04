import type { EvidenceSource, Finding } from "../evidence/types.js";

const AGENT = "dependency-auditor";
const DEP_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"] as const;
const LOOSE_SPECS = new Set(["*", "latest", "x", ""]);
const DEV_TOOL_NAMES = /^(jest|mocha|vitest|eslint|prettier|nodemon|typescript|@types\/.+)$/;

export interface PackageManifest {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const evidence = (excerpt: string): EvidenceSource[] => [{ type: "static_analysis", filePath: "package.json", excerpt }];

/** Pure, deterministic manifest checks. Every finding here is static_analysis-verified. */
export function analyzeManifest(manifest: PackageManifest, lockfilesFound: string[]): Finding[] {
  const findings: Finding[] = [];

  if (lockfilesFound.length === 0) {
    findings.push({
      id: "deps-no-lockfile",
      agent: AGENT,
      severity: "medium",
      title: "No lockfile found next to package.json",
      description:
        "Without a committed lockfile, installs resolve fresh versions each time, so a build or deploy can pick up a different dependency tree from the one that was tested.",
      evidence: evidence("no package-lock.json, yarn.lock or pnpm-lock.yaml found"),
      recommendation: "Commit the lockfile for your package manager and install with `npm ci` (or the equivalent) in CI.",
    });
  } else if (lockfilesFound.length > 1) {
    findings.push({
      id: "deps-multiple-lockfiles",
      agent: AGENT,
      severity: "low",
      title: "More than one lockfile present",
      description: "Several lockfiles usually mean two package managers are in use, and they can drift apart.",
      evidence: evidence(`lockfiles found: ${lockfilesFound.join(", ")}`),
      recommendation: "Keep the lockfile for one package manager and delete the others.",
    });
  }

  for (const section of DEP_SECTIONS) {
    const loose: string[] = [];
    const remote: string[] = [];
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (LOOSE_SPECS.has(spec.trim())) loose.push(`"${name}": "${spec}"`);
      else if (/^(git\+|git:|https?:|github:)/.test(spec)) remote.push(`"${name}": "${spec}"`);
    }
    if (loose.length > 0) {
      findings.push({
        id: `deps-unbounded-version-${section}`,
        agent: AGENT,
        severity: section === "dependencies" ? "high" : "medium",
        title: `Unbounded version range in ${section}`,
        description: `${loose.length} package(s) accept any version, so an install can pull in a breaking or compromised release.`,
        evidence: evidence(loose.join(", ")),
        recommendation: "Pin to a semver range (for example ^1.2.3) and rely on the lockfile.",
      });
    }
    if (remote.length > 0) {
      findings.push({
        id: `deps-remote-source-${section}`,
        agent: AGENT,
        severity: "medium",
        title: `Dependencies installed from a git or URL source in ${section}`,
        description:
          "These bypass the registry, so they are not covered by registry audit tooling and may not be reproducible.",
        evidence: evidence(remote.join(", ")),
        recommendation: "Publish them to a registry (private if needed) or pin to a commit hash.",
      });
    }
  }

  if (!manifest.engines?.node) {
    findings.push({
      id: "deps-no-engines-node",
      agent: AGENT,
      severity: "low",
      title: "No Node version declared in engines",
      description:
        "Nothing records which Node version the code is meant to run on, so local, CI and deploy runtimes can diverge.",
      evidence: evidence('"engines.node" is not set'),
      recommendation: 'Add an "engines": { "node": "<version>" } entry matching the deploy runtime.',
    });
  }

  const toolLike = Object.keys(manifest.dependencies ?? {}).filter((name) => DEV_TOOL_NAMES.test(name));
  if (toolLike.length > 0) {
    findings.push({
      id: "deps-dev-tools-in-runtime",
      agent: AGENT,
      severity: "low",
      title: "Development tooling listed under dependencies",
      description: "These ship in the production install and grow the deployed bundle and attack surface.",
      evidence: evidence(`dependencies includes: ${toolLike.join(", ")}`),
      recommendation: "Move them to devDependencies.",
    });
  }

  return findings;
}
