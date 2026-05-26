/**
 * Shared stack-pill tone mapping for backend and harness labels.
 *
 * Used by:
 * - src/lib/comparison-video.ts (comparison video export labels)
 * - public/js/stack-pills.js (client-side workbench pills)
 *
 * Keep the two consumers in sync when adding or changing tone mappings.
 */
export type StackRole = "backend" | "harness";

export function stackTone(label: string, role: StackRole): string {
  const value = String(label ?? "").toLowerCase();
  if (role === "harness") {
    if (/\bpi\b/u.test(value)) return "pi";
    if (/opencode|open code/u.test(value)) return "opencode";
    if (/hermes/u.test(value)) return "hermes";
    if (/manual/u.test(value)) return "manual";
    return "harness";
  }
  if (/omlx|base mlx/u.test(value)) return "omlx";
  if (/llama\.cpp|llamacpp/u.test(value)) return "llamacpp";
  if (/lm studio|lmstudio/u.test(value)) return "lmstudio";
  if (/cloud|gpt|chatgpt|openai|anthropic|claude/u.test(value)) return "cloud";
  if (/ollama/u.test(value)) return "ollama";
  if (/source unrecorded|unrecorded/u.test(value)) return "unknown";
  return "backend";
}