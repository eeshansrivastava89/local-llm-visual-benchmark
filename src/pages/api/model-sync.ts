import type { APIRoute } from "astro";
import {
  apiJsonResponse,
  assertTrustedWriteRequest,
  getDefaultLocalApi,
  readJsonRequest
} from "../../server/api";
import type { MirrorModelsRequest } from "../../server/api";

export const prerender = false;

export const GET: APIRoute = () =>
  apiJsonResponse(getDefaultLocalApi().getModelSyncState());

export const POST: APIRoute = async ({ request }) =>
  apiJsonResponse(
    Promise.resolve()
      .then(() => assertTrustedWriteRequest(request))
      .then(() => readJsonRequest(request))
      .then((body) =>
        getDefaultLocalApi().mirrorModels(body as MirrorModelsRequest)
      )
  );
