import type { APIRoute } from "astro";
import { apiJsonResponse, getDefaultLocalApi } from "../../../server/api";

export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  apiJsonResponse(
    getDefaultLocalApi().getOmlxModels({
      baseUrl: url.searchParams.get("baseUrl") ?? undefined
    })
  );
