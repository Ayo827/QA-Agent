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

## Status

Phase 1–3 of the build plan (scaffold, config, provider, discovery, tool-runner, evidence model, four core agents, orchestrator, Markdown/JSON report). See the project plan for the full phased roadmap (Phase 4 adds the remaining specialized agents; Phase 5 adds the fix/re-run loop, external plugins, and the rest of the CLI surface).

## Safety

- `tools.allowTestExecution` defaults to `false`. A hardcoded command denylist (`src/core/tool-runner/denylist.ts`) blocks scripts like `serve`, `start`, `shell`, `deploy`, `logs` regardless of config — these touch live infrastructure in Firebase-style target repos and are never auto-executed.
- The tool never writes into the target repo. All output (config, reports, proposed test files) stays under the `qa-agent` working directory.
- Every finding in a report is tagged `tool_execution`, `static_analysis`, or `ai_inference` — only the first two count as "verified"; inferred claims are never phrased as fact.
