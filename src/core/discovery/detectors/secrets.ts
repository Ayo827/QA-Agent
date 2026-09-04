import path from "node:path";
import fg from "fast-glob";
import { execa } from "execa";

export type SecretFileReason =
  | "env-file"
  | "service-account-json-filename"
  | "private-key-pem"
  | "private-key-filename";

export interface SecretFileHit {
  relativePath: string;
  reason: SecretFileReason;
  gitTracked: boolean;
}

const SECRET_FILE_PATTERNS: { reason: SecretFileReason; regex: RegExp }[] = [
  { reason: "env-file", regex: /(^|\/)\.env(\..+)?$/i },
  { reason: "service-account-json-filename", regex: /(serviceaccount|firebase-adminsdk).*\.json$/i },
  { reason: "private-key-pem", regex: /\.pem$/i },
  { reason: "private-key-filename", regex: /private[-_]?key/i },
];

function classify(relativePath: string): SecretFileReason | undefined {
  const match = SECRET_FILE_PATTERNS.find(({ regex }) => regex.test(relativePath));
  return match?.reason;
}

async function isGitTracked(rootPath: string, relativePath: string): Promise<boolean> {
  try {
    await execa("git", ["ls-files", "--error-unmatch", relativePath], { cwd: rootPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects likely secret/credential files by filename pattern only — never opens or reads file
 * contents. Reports git-tracked status (a tracked service-account key is far more severe than a
 * gitignored one that merely exists on disk).
 */
export async function detectSecretFiles(rootPath: string): Promise<SecretFileHit[]> {
  const entries = await fg(["**/*"], {
    cwd: rootPath,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    followSymbolicLinks: false,
  });

  const candidates = entries
    .map((relativePath) => ({ relativePath, reason: classify(relativePath) }))
    .filter((c): c is { relativePath: string; reason: SecretFileReason } => Boolean(c.reason));

  const hits: SecretFileHit[] = [];
  for (const candidate of candidates) {
    const gitTracked = await isGitTracked(rootPath, candidate.relativePath);
    hits.push({ relativePath: path.normalize(candidate.relativePath), reason: candidate.reason, gitTracked });
  }
  return hits;
}
