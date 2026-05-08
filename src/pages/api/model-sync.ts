import type { APIRoute } from "astro";
import {
  apiJsonResponse,
  getDefaultLocalApi,
  readJsonRequest
} from "../../server/api";
import type { MirrorModelsRequest } from "../../server/api";

export const prerender = false;

export const GET: APIRoute = () =>
  apiJsonResponse(getDefaultLocalApi().getModelSyncState());

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonRequest(request);
  return apiJsonResponse(getDefaultLocalApi().mirrorModels(body as MirrorModelsRequest));
};
