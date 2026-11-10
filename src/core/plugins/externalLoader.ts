import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { QAPlugin } from "./types.js";

export class PluginLoadError extends Error {
  constructor(
    readonly spec: string,
    message: string,
  ) {
    super(`Plugin "${spec}": ${message}`);
    this.name = "PluginLoadError";
  }
}

const optionalFunction = z.custom<(...args: never[]) => unknown>((v) => v === undefined || typeof v === "function", {
  message: "must be a function",
});

const PluginShapeSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    onRepoDiscovered: optionalFunction,
    provideCommands: optionalFunction,
    provideAgents: optionalFunction,
  })
  .passthrough();

/** Validates an unknown module export against the QAPlugin contract, returning the original object. */
export function validatePlugin(spec: string, candidate: unknown): QAPlugin {
  const parsed = PluginShapeSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(export)"}: ${i.message}`).join("; ");
    throw new PluginLoadError(spec, `does not match the QAPlugin contract (${issues})`);
  }
  return candidate as QAPlugin;
}

/** Relative and absolute specs are files; anything else is an installed package name. */
export function resolvePluginSpecifier(spec: string, baseDir: string): string {
  if (spec.startsWith(".") || path.isAbsolute(spec)) {
    return pathToFileURL(path.resolve(baseDir, spec)).href;
  }
  return spec;
}

export async function loadExternalPlugin(spec: string, baseDir: string = process.cwd()): Promise<QAPlugin> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(resolvePluginSpecifier(spec, baseDir))) as Record<string, unknown>;
  } catch (err) {
    throw new PluginLoadError(spec, `could not be imported (${err instanceof Error ? err.message : String(err)})`);
  }
  const candidate = mod.default ?? mod.plugin;
  if (candidate === undefined) {
    throw new PluginLoadError(spec, 'has no default export or named export "plugin"');
  }
  return validatePlugin(spec, candidate);
}

export async function loadExternalPlugins(specs: string[], baseDir?: string): Promise<QAPlugin[]> {
  const plugins: QAPlugin[] = [];
  for (const spec of specs) {
    const plugin = await loadExternalPlugin(spec, baseDir);
    if (plugins.some((p) => p.name === plugin.name)) {
      throw new PluginLoadError(spec, `its name "${plugin.name}" is already used by another loaded plugin`);
    }
    plugins.push(plugin);
  }
  return plugins;
}
