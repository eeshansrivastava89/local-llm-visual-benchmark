import { existsSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { colors } from "./ui.mjs";

export function tailFriendly(rawLogPath, friendlyLogPath) {
  let offset = existsSync(rawLogPath) ? statSync(rawLogPath).size : 0;
  let stopped = false;
  const seen = new Set();
  const timer = setInterval(async () => {
    try {
      if (stopped || !existsSync(rawLogPath)) return;
      const size = statSync(rawLogPath).size;
      if (size <= offset) return;
      const stream = createReadStream(rawLogPath, { start: offset, end: size - 1, encoding: "utf8" });
      offset = size;
      let text = "";
      for await (const chunk of stream) text += chunk;
      for (const line of text.split(/\r?\n/u).filter(Boolean)) {
        const friendly = friendlyLine(line);
        if (!friendly || seen.has(friendly)) continue;
        seen.add(friendly);
        console.log(friendly);
        await appendFile(friendlyLogPath, stripAnsi(friendly) + "\n", "utf8");
      }
    } catch {
      // Friendly logging must never kill the launched server flow.
    }
  }, 300);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}

export function friendlyLine(line) {
  const lower = line.toLowerCase();
  const trimmed = line.trim();
  if (lower.includes("error") || lower.includes("failed")) return colors.red(`[error] ${trimmed}`);
  if (lower.includes("listening") || lower.includes("http server")) return colors.green(`[server] ${trimmed}`);
  if (lower.includes("llm_load") || lower.includes("load_model") || lower.includes("loading model")) return colors.cyan(`[load] ${trimmed}`);
  if (lower.includes("mmproj")) return colors.cyan(`[vision] ${trimmed}`);
  if (lower.includes("prompt eval") || lower.includes("prompt eval time")) return colors.green(`[timing] ${trimmed}`);
  if (lower.includes("eval time") || lower.includes("generation")) return colors.green(`[timing] ${trimmed}`);
  if (lower.includes("slot") && lower.includes("launch_slot")) return colors.cyan(`[request] ${trimmed}`);
  return null;
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/gu, "");
}
