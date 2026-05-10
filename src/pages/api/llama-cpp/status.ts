import type { APIRoute } from "astro";
import { apiJsonResponse } from "../../../server/api";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const baseUrl = url.searchParams.get("baseUrl") ?? "http://127.0.0.1:8080/v1";

  try {
    const response = await fetch(baseUrl + "/models", {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const data = (await response.json()) as { data?: unknown };
      return apiJsonResponse({
        ok: true,
        baseUrl,
        modelCount: Array.isArray(data.data) ? data.data.length : 0
      });
    }

    return apiJsonResponse({
      ok: false,
      baseUrl,
      error: `Server responded with HTTP ${response.status}`
    });
  } catch (error) {
    return apiJsonResponse({
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
