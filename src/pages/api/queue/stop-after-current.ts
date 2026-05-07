import type { APIRoute } from "astro";
import { apiJsonResponse, getDefaultLocalApi } from "../../../server/api";

export const prerender = false;

export const POST: APIRoute = () =>
  apiJsonResponse(getDefaultLocalApi().stopAfterCurrent());
