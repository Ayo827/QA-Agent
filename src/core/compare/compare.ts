import type { Finding, Severity } from "../evidence/types.js";
import { isVerified, SEVERITY_ORDER } from "../evidence/types.js";

export interface SeverityChange {
  finding: Finding;
  from: Severity;
  to: Severity;
}

export interface RunComparison {
  baselineGeneratedAt: string;
  baselinePath?: string;
  /** In the baseline, gone now. */
  resolved: Finding[];
  /** Not in the baseline. */
  introduced: Finding[];
  /** In both, same severity. */
  persisting: Finding[];
  /** In both, severity moved. */
  changedSeverity: SeverityChange[];
}

/** Exact-match key: agent + id. See pairFindings for how re-worded ids are still paired. */
export function fingerprint(finding: Finding): string {
  return `${finding.agent}::${finding.id}`;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "in", "on", "to", "and", "or", "for", "with", "no", "not", "is", "are"]);

function words(finding: Finding): Set<string> {
  return new Set(
    `${finding.title}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function similarity(a: Finding, b: Finding): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

/** Below this, two differently-named findings are treated as unrelated. */
const SIMILARITY_THRESHOLD = 0.5;

/**
 * Pairs each current finding with its baseline counterpart. Exact agent+id matches win. The model
 * re-words ids between runs, so what is left is paired within the same agent by title similarity
 * (best pair first, each finding used once). Deterministic findings have stable ids and never
 * need the fallback.
 */
function pairFindings(baseline: Finding[], current: Finding[]): Map<Finding, Finding> {
  const pairs = new Map<Finding, Finding>();
  const usedBaseline = new Set<Finding>();

  const byKey = new Map<string, Finding>();
  for (const f of baseline) if (!byKey.has(fingerprint(f))) byKey.set(fingerprint(f), f);
  for (const f of current) {
    const match = byKey.get(fingerprint(f));
    if (match && !usedBaseline.has(match)) {
      pairs.set(f, match);
      usedBaseline.add(match);
    }
  }

  const candidates: { cur: Finding; base: Finding; score: number }[] = [];
  for (const cur of current) {
    if (pairs.has(cur)) continue;
    for (const base of baseline) {
      if (usedBaseline.has(base) || base.agent !== cur.agent) continue;
      const score = similarity(base, cur);
      if (score >= SIMILARITY_THRESHOLD) candidates.push({ cur, base, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  for (const { cur, base } of candidates) {
    if (pairs.has(cur) || usedBaseline.has(base)) continue;
    pairs.set(cur, base);
    usedBaseline.add(base);
  }
  return pairs;
}

export function compareFindings(
  baseline: Finding[],
  current: Finding[],
  meta: { baselineGeneratedAt: string; baselinePath?: string },
): RunComparison {
  const pairs = pairFindings(baseline, current);
  const matchedBaseline = new Set(pairs.values());

  const resolved = baseline.filter((f) => !matchedBaseline.has(f));
  const introduced: Finding[] = [];
  const persisting: Finding[] = [];
  const changedSeverity: SeverityChange[] = [];

  for (const finding of current) {
    const before = pairs.get(finding);
    if (!before) introduced.push(finding);
    else if (before.severity === finding.severity) persisting.push(finding);
    else changedSeverity.push({ finding, from: before.severity, to: finding.severity });
  }

  return { ...meta, resolved, introduced, persisting, changedSeverity };
}

/**
 * True when the run made things worse: a new finding, or a finding that got more severe. Only
 * verified findings count, as with failOn: the model words unverified hunches differently every run,
 * so they would trip a CI gate on noise.
 */
export function hasRegression(comparison: RunComparison, atOrAbove: Severity = "medium"): boolean {
  const limit = SEVERITY_ORDER.indexOf(atOrAbove);
  const serious = (s: Severity) => SEVERITY_ORDER.indexOf(s) <= limit;
  return (
    comparison.introduced.some((f) => isVerified(f) && serious(f.severity)) ||
    comparison.changedSeverity.some((c) => isVerified(c.finding) && SEVERITY_ORDER.indexOf(c.to) < SEVERITY_ORDER.indexOf(c.from) && serious(c.to))
  );
}
