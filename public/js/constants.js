export const DEFAULT_LLAMA_CPP_BASE_URL = "http://127.0.0.1:8080/v1";
export const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_LLAMA_CPP_MODEL_PATH = "/path/to/model.gguf";
export const DEFAULT_LIGHTEVAL_TASKS = "boolq|0";

export const LIGHTEVAL_TASK_PRESETS = [
  {
    value: "boolq|0",
    label: "BoolQ smoke test",
    description: "Short yes/no reading-comprehension task. Good first dry run."
  },
  {
    value: "arc:easy|0",
    label: "ARC Easy",
    description: "Grade-school science multiple choice."
  },
  {
    value: "piqa|0",
    label: "PIQA",
    description: "Physical commonsense multiple choice."
  },
  {
    value: "hellaswag|0",
    label: "HellaSwag",
    description: "Commonsense sentence-completion task."
  },
  {
    value: "gsm8k|0",
    label: "GSM8K",
    description: "Math word problems. Useful after the smoke test."
  }
];
