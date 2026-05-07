import type { LMStudioModel } from "./types";

const DEFAULT_BASE_URL = "http://localhost:1234/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface LMStudioRequestOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LMStudioConnectionResult {
  ok: boolean;
  baseUrl: string;
  error?: string;
}

export interface LMStudioCompletionRequest extends LMStudioRequestOptions {
  modelId: string;
  prompt: string;
}

interface ModelsResponse {
  data?: unknown;
}

interface ChatCompletionResponse {
  choices?: unknown;
}

export function normalizeLmStudioBaseUrl(baseUrl?: string): string {
  const raw = baseUrl?.trim() || DEFAULT_BASE_URL;
  let url: URL;

  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid LM Studio base URL "${raw}": ${formatCause(error)}`);
  }

  url.hash = "";
  url.search = "";

  const pathname = url.pathname.replace(/\/+$/u, "");
  url.pathname = pathname.length === 0 ? "/v1" : pathname;

  return url.toString().replace(/\/+$/u, "");
}

export async function checkLmStudioConnection(
  baseUrl?: string,
  options: Omit<LMStudioRequestOptions, "baseUrl"> = {}
): Promise<LMStudioConnectionResult> {
  const normalizedBaseUrl = normalizeLmStudioBaseUrl(baseUrl);

  try {
    await fetchJson(`${normalizedBaseUrl}/models`, {
      method: "GET",
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      context: "checking LM Studio connection"
    });

    return {
      ok: true,
      baseUrl: normalizedBaseUrl
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl: normalizedBaseUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function listLmStudioModels(
  baseUrl?: string,
  options: Omit<LMStudioRequestOptions, "baseUrl"> = {}
): Promise<LMStudioModel[]> {
  const normalizedBaseUrl = normalizeLmStudioBaseUrl(baseUrl);
  const body = (await fetchJson(`${normalizedBaseUrl}/models`, {
    method: "GET",
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    context: "listing LM Studio models"
  })) as ModelsResponse;

  if (!Array.isArray(body.data)) {
    throw new Error("Malformed LM Studio /models response: expected data array.");
  }

  return body.data.map((model, index) => {
    if (!isRecord(model) || typeof model.id !== "string") {
      throw new Error(
        `Malformed LM Studio /models response: model at index ${index} is missing a string id.`
      );
    }

    return {
      id: model.id
    };
  });
}

export async function requestLmStudioCompletion(
  request: LMStudioCompletionRequest
): Promise<string> {
  const normalizedBaseUrl = normalizeLmStudioBaseUrl(request.baseUrl);
  const body = (await fetchJson(`${normalizedBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: request.modelId,
      messages: [
        {
          role: "user",
          content: request.prompt
        }
      ]
    }),
    signal: request.signal,
    timeoutMs: request.timeoutMs,
    context: "requesting LM Studio chat completion"
  })) as ChatCompletionResponse;

  const content = extractAssistantContent(body);
  if (typeof content !== "string") {
    throw new Error(
      "Malformed LM Studio chat completion response: expected choices[0].message.content string."
    );
  }

  return content;
}

async function fetchJson(
  url: string,
  options: RequestInit & {
    context: string;
    timeoutMs?: number;
  }
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const abortFromCaller = () => abortController.abort(options.signal?.reason);

  if (options.signal?.aborted) {
    throw new Error(`LM Studio ${options.context} was aborted.`);
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      abortController.abort(new DOMException("Request timed out", "TimeoutError"));
    }, timeoutMs);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: abortController.signal
    });

    if (!response.ok) {
      throw new Error(
        `LM Studio request failed with HTTP ${response.status} ${response.statusText} while ${options.context}.`.trim()
      );
    }

    return await response.json();
  } catch (error) {
    if (timedOut) {
      throw new Error(`LM Studio ${options.context} timed out after ${timeoutMs}ms.`);
    }

    if (isAbortError(error) || abortController.signal.aborted) {
      throw new Error(`LM Studio ${options.context} was aborted.`);
    }

    if (error instanceof Error && error.message.includes("HTTP ")) {
      throw error;
    }

    throw new Error(`LM Studio ${options.context} network error: ${formatCause(error)}`);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function extractAssistantContent(response: ChatCompletionResponse): unknown {
  if (!Array.isArray(response.choices) || response.choices.length === 0) {
    return undefined;
  }

  const [firstChoice] = response.choices;
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return undefined;
  }

  return firstChoice.message.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatCause(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
