import type { APIRoute } from "astro";
import {
  apiJsonResponse,
  assertTrustedWriteRequest,
  getDefaultLocalApi,
  readJsonRequest,
  type DeleteRunRequest
} from "../../server/api";

export const prerender = false;

export const GET: APIRoute = () =>
  apiJsonResponse(getDefaultLocalApi().getSavedRuns());

export const DELETE: APIRoute = async ({ request }) =>
  apiJsonResponse(
    Promise.resolve()
      .then(() => assertTrustedWriteRequest(request))
      .then(() => readJsonRequest(request))
      .then((body) =>
        getDefaultLocalApi().deleteSavedRun(body as DeleteRunRequest)
      )
  );
