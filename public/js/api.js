export async function fetchJson(url) {
  const response = await fetch(url);
  return readJsonResponse(response);
}

export async function fetchStaticManifest() {
  try {
    return await fetchJson("export/manifest.json");
  } catch {
    return fetchJson("/export/manifest.json");
  }
}

export async function postJson(url, body) {
  return sendJson(url, "POST", body);
}

export async function deleteJson(url, body) {
  return sendJson(url, "DELETE", body);
}

async function sendJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse(response);
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Request failed with HTTP " + response.status + ".");
  }
  return data;
}
