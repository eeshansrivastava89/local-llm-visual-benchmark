# local-llm CLI

Tiny helper for running LM Studio GGUF models with `llama-server`, then using Pi or OpenCode.

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

Shows all downloaded models. Models that already have profiles are marked as set up; choosing one will offer sync/details instead of creating a duplicate.

Creates a profile folder:

```text
.local-llm/profiles/<profile-id>/
  profile.json       # small metadata only: id, label, provider
  llama-server.sh    # source of truth for every launch flag
  notes.md           # scratch notes for this local profile
```

For existing profiles, edit `llama-server.sh` directly; `setup <profile> --sync both` only syncs Pi/OpenCode from that command file.

### List / inspect

```bash
local-llm list
```

Shows saved profiles and downloaded models that are not set up yet. Pick a number to inspect details.

Direct inspect still works if you already know the profile id:

```bash
local-llm list qwen36-27b-mtp
```

### Run

```bash
local-llm run
```

Choose a profile, then choose Pi, OpenCode, or server-only mode.

You can still skip the picker:

```bash
local-llm run qwen36-27b-mtp --with pi
local-llm run qwen36-27b-mtp --with opencode
```

When the CLI starts the server for Pi/OpenCode, it stops that server again after Pi/OpenCode exits. Use `--keep-server` to leave it running.

### Stop

```bash
local-llm stop qwen36-27b-mtp
```

This is the safety command for server-only runs or kept-alive servers.

## Edit llama.cpp flags

Open the command file and edit the `llama-server` command directly:

```bash
$EDITOR .local-llm/profiles/qwen36-27b-mtp/llama-server.sh
```

Add, remove, or reorder flags as plain shell text. `list`, `run`, memory estimates, and Pi/OpenCode sync all read this file as the source of truth. Do not edit `profile.json` for context/cache/model/server changes.

## Sync Pi/OpenCode config

```bash
local-llm setup qwen36-27b-mtp --sync both
```

Use `pi`, `opencode`, or `both`.
