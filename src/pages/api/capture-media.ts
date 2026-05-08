import type { APIRoute } from "astro";
import {
  apiJsonResponse,
  getDefaultLocalApi,
  readJsonRequest,
  type CaptureMediaRequest
} from "../../server/api";

export const prerender = false;

export const POST: APIRoute = async ({ request }) =>
  apiJsonResponse(
    readJsonRequest(request).then((body) =>
      getDefaultLocalApi().captureMissingMedia(body as CaptureMediaRequest)
    )
  );
