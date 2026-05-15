#!/usr/bin/env node
import { runCli } from "./local-llm/cli.mjs";
import { colors } from "./local-llm/ui.mjs";

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  console.error(colors.red("error:"), error instanceof Error ? error.message : String(error));
  process.exit(1);
}
