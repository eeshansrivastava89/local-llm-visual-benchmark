# local-llm CLI

Local LLM profile runner supporting llama.cpp, Ollama, and oMLX backends.

## Run it from anywhere

One-time setup from the repo root:

```bash
npm link
```

Then from any benchmark run folder:

```bash
local-llm run
```

That opens a picker for profile + Pi/OpenCode/server-only mode. `local-llm` keeps profiles/logs in this repo, but Pi/OpenCode still launch from your current terminal folder.

## Main commands

### Setup

```bash
local-llm setup
```

Choose a backend (llama.cpp, llama.cpp MTP, Ollama, or oMLX), then pick a model and configure:

- **llama.cpp / MTP**: Select a GGUF model file from `~/.lmstudio/models/`, choose a server variant and preset, configure sampling parameters, save the profile.
- **Ollama**: Select a model from the running Ollama service (`localhost:11434`), configure the endpoint, save the profile. No command file or local GGUF needed — Ollama manages everything.
- **oMLX**: Select a model from the running oMLX service (`127.0.0.1:8000`), same story.

For existing profiles, edit the command file (llama.cpp) or `profile.json` (managed backends) directly:

```bash
$EDITOR .local-llm/profiles/<id>/llama-server.sh   # llama.cpp
$EDITOR .local-llm/profiles/<id>/profile.json        # Ollama / oMLX
```

`local-llm setup <profile> --sync both` syncs Pi/OpenCode from that profile.

### List / inspect

```bash
local-llm list
```

Shows saved profiles with backend badges (`[Ollama]`, `[oMLX]`), then unprofiled GGUF models, then Ollama and oMLX models. 🟢 = server responding. Pick a number to inspect details.

### Prepare

```bash
local-llm prepare
n```

Interactive walkthrough that creates a benchmark run directory with prompt and metadata. Picks a benchmark category (visual or data-science), selects a prompt, chooses a model source, and writes `metadata.json` + `prompt.md` into `runs/<benchmark>/<model-slug>/<timestamp>/`.

Model source options:
- **Use existing profile** — pick from saved local-llm profiles
- **Ollama (managed)** — pick a model from the running Ollama service
- **oMLX (managed)** — pick a model from the running oMLX service
- **llama.cpp (unprofiled)** — pick a GGUF file (does not create a profile)
- **Custom / cloud** — free-form model label for cloud runs

The prepared directory contains:
- `metadata.json` — run metadata with model, source, harness, and asset info
- `prompt.md` — the generated tool prompt
- `supabase.json` — (data-science only) Supabase config for live data

### Run

```bash
local-llm run
```

Choose a profile, then choose Pi, OpenCode, or server-only mode.

For **llama.cpp** profiles: starts `llama-server`, waits for readiness, then launches the harness. Stops the server when the harness exits (unless `--keep-server`).

For **Ollama / oMLX** profiles: verifies the service is responding, then launches the harness. Does not start or stop the managed service.

```bash
local-llm run <profile> --with pi
local-llm run <profile> --with opencode
```

### Stop

```bash
local-llm stop
local-llm stop <profile>
local-llm stop --all
```

For **llama.cpp** profiles: stops the tracked `llama-server` process.

For **Ollama / oMLX** profiles: reports that the service is managed and not stopped by local-llm.

## Backends

| Backend | Type | Server management | Model source | Profile files |
|---|---|---|---|---|
| llama.cpp | local-server | Start/stop `llama-server` process | `~/.lmstudio/models/` GGUF files | `llama-server.sh` + `profile.json` |
| llama.cpp MTP | local-server | Start/stop with speculative decoding flags | `~/.lmstudio/models/` GGUF files | `llama-server.sh` + `profile.json` |
| Ollama | managed-server | Verify connectivity only | Ollama API (`localhost:11434`) | `profile.json` only |
| oMLX | managed-server | Verify connectivity only | oMLX API (`127.0.0.1:8000`) | `profile.json` only |

## Profile structure

```text
.local-llm/profiles/<profile-id>/
  profile.json       # display metadata + backend + model info
  llama-server.sh    # llama.cpp command file (local-server backends only)
  notes.md           # scratch notes
```

For llama.cpp profiles, `llama-server.sh` is the source of truth for runtime flags, model path, alias, and port. For Ollama/oMLX profiles, only `profile.json` is needed.

## MTP profiles

For MTP GGUFs, choose **MTP llama.cpp** during setup. The CLI writes the shared upstream binary plus speculative-decoding flags into `llama-server.sh`, stores `providerId: "llama-cpp-mtp"` in `profile.json`, and syncs Pi/OpenCode under that provider.

Only one server can use port `8081` at a time. If you want to run multiple MTP profiles concurrently, edit the `--port` in that profile's `llama-server.sh`, then run `local-llm setup <profile-id> --sync both`.