import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface LightEvalResultMetric {
  metricName: string;
  value: number;
  higherIsBetter: boolean;
}

export interface LightEvalSummary {
  taskId: string;
  taskName: string;
  metrics: LightEvalResultMetric[];
  totalEvaluationTimeSeconds?: number;
  modelName?: string;
}

export async function parseLightEvalResults(runDirectory: string): Promise<LightEvalSummary[]> {
  const resultsDir = join(runDirectory, "results");
  const resultFiles = await findResultJsonFiles(resultsDir);
  if (resultFiles.length === 0) return [];

  const summaries: LightEvalSummary[] = [];

  for (const filePath of resultFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      const data = JSON.parse(raw) as {
        results?: Record<string, Record<string, number>>;
        config_tasks?: Record<string, {
          name?: string;
          metrics?: Array<{
            metric_name: string;
            higher_is_better: boolean;
          }>;
        }>;
        config_general?: {
          total_evaluation_time_secondes?: string | number;
          model_name?: string;
        };
      };

      if (!data.results || !data.config_tasks) continue;

      const modelName = data.config_general?.model_name;
      const time = data.config_general?.total_evaluation_time_secondes;

      for (const [taskId, taskResults] of Object.entries(data.results)) {
        const taskConfig = data.config_tasks[taskId];
        if (!taskConfig) continue;

        const metrics: LightEvalResultMetric[] = [];

        for (const [metricName, value] of Object.entries(taskResults)) {
          const metricConfig = taskConfig.metrics?.find((m) => m.metric_name === metricName);
          metrics.push({
            metricName,
            value: typeof value === "number" ? value : Number(value),
            higherIsBetter: metricConfig?.higher_is_better ?? true
          });
        }

        summaries.push({
          taskId,
          taskName: taskConfig.name ?? taskId,
          metrics,
          ...(typeof time !== "undefined" ? { totalEvaluationTimeSeconds: Number(time) } : {}),
          ...(modelName ? { modelName } : {})
        });
      }
    } catch {
      // Skip malformed or unreadable files
    }
  }

  return summaries;
}

async function findResultJsonFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  await walk(directory);
  return files;
}
