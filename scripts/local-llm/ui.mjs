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
  console.log(`${colors.bold("local-llm")} - transparent llama.cpp profile runner\n`);
  console.log("Usage:");
  console.log("  scripts/local-llm.mjs list [profile-id]");
  console.log("  scripts/local-llm.mjs setup [profile]");
  console.log("  scripts/local-llm.mjs run [profile] [--with pi|opencode] [--reuse-existing] [--keep-server]");
  console.log("  scripts/local-llm.mjs stop [profile|--all]");
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

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/gu, "");
}
