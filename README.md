# qa-agent

Autonomous AI Backend QA Engineer. Points at any backend repo, runs its real lint/build/test tooling, runs Claude-backed review agents against it, and writes an evidence-backed Markdown/JSON report.

## Setup

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY
npm run build
```

## Usage

```bash
node dist/cli/index.js init --target /path/to/backend/repo
node dist/cli/index.js doctor
node dist/cli/index.js run
```

During development, use `npm run dev -- <command>` to run the CLI directly from TypeScript source via `tsx`.

| Command | What it does |
|---|---|
| `qa init [target]` | Write `qa.config.json` for a target repo |
| `qa doctor [--live]` | Check config, API key, target repo and tooling |
| `qa run [target] [--baseline <ref>] [--fail-on-regression]` | Run tools and agents, write a report |
| `qa rerun [baseline]` | `run` compared against the previous report (default `latest`): resolved / new / unchanged |
| `qa fix [ref] [--min-severity] [--max] [--only]` | Propose patches for findings; checked with `git apply --check`, never applied |
| `qa compare <baseline> [current]` | Diff two existing reports; no tools, no AI |
| `qa report [ref] [--format html|markdown]` | Re-render a report from its `report.json` |
| `qa agents` | List built-in and plugin agents and which are enabled |

A report reference (`ref`) is `latest`, a run directory, or a `report.json`.

### The fix loop

```bash
qa run                      # find problems
qa fix                      # writes reports/<target>/<run>/fixes/*.patch and fixes/index.md
git apply --ignore-whitespace <patch>   # you, in the target repo, after review
qa rerun                    # confirms what is now resolved, and flags regressions
```

Only findings that cite a readable source file get a patch. A patch may only change files the model was shown, and may not create or delete files.

### Agents

architecture-reviewer, backend-reviewer, api-contract-reviewer, data-layer-reviewer, dependency-auditor (deterministic manifest checks plus review), performance-reviewer, security-auditor (deterministic secret scan plus review), test-generation. Choose them with `run.agents` in `qa.config.json`; they always run in dependency order.

### Plugins

List modules in `plugins` (paths relative to where you run `qa`, or installed package names). Each default-exports (or exports as `plugin`) a `QAPlugin`: a `name`, a `version`, and any of `onRepoDiscovered`, `provideCommands`, `provideAgents`. Plugin agents run after the built-ins and see their findings. A plugin agent cannot reuse a built-in agent name.

```json
{ "plugins": ["./my-plugin.mjs"] }
```

## Status

All five phases are built: scaffold, config, provider, discovery, tool-runner, evidence model, eight agents, orchestrator, Markdown/JSON/HTML reports, baseline comparison, the fix proposer, external plugins and the CLI above.

`report.json` is always written, because baselines and `qa fix` read it. Findings are matched between runs by agent name + finding id.

## Safety

- `tools.allowTestExecution` defaults to `false`. A hardcoded command denylist (`src/core/tool-runner/denylist.ts`) blocks scripts like `serve`, `start`, `shell`, `deploy`, `logs` regardless of config — these touch live infrastructure in Firebase-style target repos and are never auto-executed.
- The tool never writes into the target repo. All output (config, reports, proposed test files, proposed fix patches) stays under the `qa-agent` working directory.
- Every finding in a report is tagged `tool_execution`, `static_analysis`, or `ai_inference` — only the first two count as "verified"; inferred claims are never phrased as fact.
