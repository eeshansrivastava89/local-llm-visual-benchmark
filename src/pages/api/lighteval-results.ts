import type { APIRoute } from "astro";
import { apiJsonResponse, getDefaultLocalApi } from "../../server/api";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const runDirectory = url.searchParams.get("runDirectory");

  if (!runDirectory) {
    return apiJsonResponse(Promise.reject(new Error("runDirectory is required.")));
  }

  return apiJsonResponse(
    getDefaultLocalApi().getLightEvalResults({ runDirectory })
  );
};
