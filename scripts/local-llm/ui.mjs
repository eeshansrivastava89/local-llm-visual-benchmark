import { cancel, confirm, intro, isCancel, select, text } from "@clack/prompts";

export const colors = {
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  blue: (s) => `\x1b[34m${s}\x1b[39m`,
  magenta: (s) => `\x1b[35m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`
};

export function printHelp() {
  console.log(`${colors.bold("local-llm")} - local LLM profile runner\n`);
  console.log("Usage:");
  console.log("  local-llm models");
  console.log("  local-llm run [profile] [--with pi|opencode] [--reuse-existing] [--keep-server]");
  console.log("  local-llm stop [profile|--all]");
  console.log("");
  console.log(colors.bold("Commands:"));
  console.log("  models    List profiles and models; inspect, set up, run, benchmark, or remove");
  console.log("  run       Start server + launch harness for a profile");
  console.log("  stop      Stop a tracked llama-server process");
  console.log("");
  console.log(colors.bold("Run modes (use with models → Run):"));
  console.log("  pi        Launch Pi with the selected model");
  console.log("  opencode  Launch OpenCode with the selected model");
  console.log("  server    Start server only, no harness");
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export function startInteractive(title = "local-llm") {
  if (process.stdin.isTTY) console.clear();
  intro(title);
}

export function createPrompt() {
  return {
    async text(label, defaultValue) {
      const value = await text({
        message: label,
        initialValue: defaultValue === undefined ? undefined : String(defaultValue)
      });
      return handleCancel(value).trim() || String(defaultValue ?? "");
    },
    async number(label, defaultValue, min, max) {
      const value = await text({
        message: label,
        initialValue: String(defaultValue),
        validate(input) {
          const number = Number(input);
          if (!Number.isFinite(number) || number < min || number > max) return `Enter a number from ${min} to ${max}.`;
        }
      });
      return Number(handleCancel(value));
    },
    async yesNo(label, defaultValue) {
      const value = await confirm({ message: label, initialValue: defaultValue });
      return handleCancel(value);
    },
    async choice(label, choices, defaultValue) {
      const value = await select({
        message: label,
        initialValue: defaultValue,
        options: choices.map((choice) => ({
          value: choice.value,
          label: choice.label ?? choice.value,
          hint: choice.hint
        }))
      });
      return handleCancel(value);
    },
    close() {}
  };
}

function handleCancel(value) {
  if (isCancel(value)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}

export function relativeTime(date) {
  const ms = Date.now() - date.getTime();
  const abs = Math.abs(ms);
  const units = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000]
  ];
  for (const [label, size] of units) {
    if (abs >= size) {
      const value = Math.round(abs / size);
      return `${value} ${label}${value === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function renderRows(rows) {
  const width = Math.max(...rows.map(([key]) => stripAnsi(String(key)).length));
  return rows.map(([key, value]) => {
    const keyText = String(key);
    const visible = stripAnsi(keyText).length;
    return `${keyText}${" ".repeat(Math.max(1, width - visible + 2))}${value}`;
  }).join("\n");
}

export function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/gu, "");
}

export function renderSection(title, body) {
  return `${colors.magenta("◆")} ${colors.bold(title)}\n${body}`;
}

export function parseOptions(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i += 1;
      } else {
        options[key] = true;
      }
    } else {
      positional.push(item);
    }
  }
  return { positional, options };
}

