# AGENTS.md

Project-specific notes for coding agents working in this repo.

## Publishing workflow

Use one command before committing benchmark/gallery updates:

```bash
npm run publish
```

Then use normal git:

```bash
git add .
git commit -m "..."
git push
```

Why: local benchmark runs are written to ignored `runs/`, but production reads tracked `public/export/`. `npm run publish` refreshes `public/export`, runs checks/tests, and builds the static site. Do not push benchmark updates without it.

## Data folders

- `runs/` — ignored local run source data. Do not commit.
- `public/export/` — tracked public gallery snapshot. Commit this after `npm run publish`.
- `comparison-exports/` — ignored local video exports. Preserve unless explicitly told otherwise.
- `.local-llm/` — ignored local model profiles, logs, and state. Preserve unless explicitly told otherwise.
- `dist/` and `dist-static/` — ignored build output.

## Local LLM profile rules

- `.local-llm/profiles/*/profile.json` stores backend, model info, and display metadata.
- `.local-llm/profiles/*/llama-server.sh` is the runtime source of truth for llama.cpp profiles: binary, model path, alias, port, context/cache, MTP flags, sampling flags. Ollama/oMLX profiles have no command file.
- If `--alias`, `--port`, or provider-facing details change, sync harness config:

```bash
local-llm models  # then choose Set up → sync both harnesses
```

- `local-llm stop` with no profile should show running tracked servers; use `local-llm stop --all` for emergencies.
- `local-llm models` is the single entry point for all actions (inspect, set up, run, benchmark, remove).

## Supported backends

| Backend | Type | Server management | Model source |
|---|---|---|---|
| llama.cpp | local-server | Start/stop process | `~/.lmstudio/models/` GGUF |
| llama.cpp MTP | local-server | Start/stop with speculative decoding | `~/.lmstudio/models/` GGUF |
| Ollama | managed-server | Verify connectivity | Ollama API (`localhost:11434`) |
| oMLX | managed-server | Verify connectivity | oMLX API (`127.0.0.1:8000`) |

## llama.cpp setup

- Canonical local server binary for both standard and MTP profiles:

```text
/Users/eeshans/dev/llama.cpp-mtp/build/bin/llama-server
```

- This checkout tracks upstream `ggml-org/llama.cpp` and is used until Homebrew stable `llama-server` is new enough for MTP.
- Standard profiles use provider `llama-cpp`, port `8080`, and no MTP speculative flags.
- MTP profiles use provider `llama-cpp-mtp`, port `8081`, and these flags:

```bash
--spec-type draft-mtp
--spec-draft-n-max 2
```

- MTP profiles can optionally include a separate drafter model via `draftModelPath` in the profile, which emits `--spec-draft-model <path>` in the command. If not set, uses built-in MTP heads.
- Gemma 4 MTP drafter (`gemma4_assistant` architecture) requires the `atomic-llama-cpp-turboquant` fork, not stock llama.cpp.
- Current upstream default for `--spec-draft-p-min` is `0.00`; leave it implicit unless intentionally testing that parameter.
- MTP decoding can affect output, not just speed, so keep `llama-cpp-mtp` labeled separately in benchmark metadata.
- MTP profiles use port `8081`; only run one at a time unless you edit the port and sync configs.

## Model source schema

- `modelSource` ∈ `{ollama, omlx, llama-cpp, llama-cpp-mtp, cloud}`
- Old values `custom`, `lmstudio`, `(none)` have been migrated to the new set
- `isCloudRun` in UI: `run.runner?.modelSource === "cloud"`
- `backendLabel` is display-only, not used for filtering

## CLI commands

- `local-llm models` — interactive: inspect, set up, run, benchmark, remove
- `local-llm run <profile>` — start server + launch harness (auto-syncs Pi/OpenCode config)
- `local-llm stop [profile|--all]` — stop tracked servers

## Validation

Common checks:

```bash
npm run check
npm test
npm run build:static
```

`npm run publish` already runs check, tests, and a static build after refreshing `public/export`.

## GitHub Pages

- Production domain: `https://localai.eeshans.com/`.
- Pages deploy uses GitHub Actions and committed `public/export`.
- CI builds with:

```text
STATIC_USE_EXISTING_EXPORT=true
ASTRO_BASE=/
```

So CI will not read local ignored `runs/`; commit `public/export` or production will stay stale.

## Privacy / public export

The public export should include summary metadata, benchmark text, preview PNGs, and preview MP4s. It should not publish raw generated HTML, prepared prompts, raw responses, logs, command files, local service URLs, or local filesystem paths.

Production GitHub Pages enables PostHog through public env vars in `.github/workflows/deploy-pages.yml`; local builds keep analytics disabled unless those env vars are set.

## Keep changes small

Prefer one clear workflow over multiple commands. Avoid duplicate state, dead code, and broad provider/cloud management unless the user explicitly asks for it.