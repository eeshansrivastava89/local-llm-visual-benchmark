import type { APIRoute } from "astro";
import {
  apiJsonResponse,
  getDefaultLocalApi,
  readJsonRequest,
  type DeleteRunRequest
} from "../../server/api";

export const prerender = false;

export const GET: APIRoute = () =>
  apiJsonResponse(getDefaultLocalApi().getSavedRuns());

export const DELETE: APIRoute = async ({ request }) =>
  apiJsonResponse(
    readJsonRequest(request).then((body) =>
      getDefaultLocalApi().deleteSavedRun(body as DeleteRunRequest)
    )
  );
