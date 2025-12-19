/** API client for FastAPI backend */

const API_BASE = "http://localhost:8000/api";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getConfig() {
  return fetchJson<{
    server: string;
    serverUrl: string;
    version: string;
    language: string;
    mmsRelease: string;
  }>(`${API_BASE}/config`);
}

export async function getFoundationEntity(entityId: string) {
  return fetchJson(`${API_BASE}/foundation/${entityId}`);
}

export async function getMmsEntity(entityId: string) {
  return fetchJson(`${API_BASE}/mms/${entityId}`);
}

export async function getByCode(code: string) {
  return fetchJson(`${API_BASE}/code/${code}`);
}

export async function search(query: string) {
  return fetchJson(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
}

export async function getEntityByUri(uri: string) {
  return fetchJson(`${API_BASE}/entity?uri=${encodeURIComponent(uri)}`);
}

export async function getChildren(entityId: string, linearization: "mms" | "foundation" = "mms") {
  return fetchJson<{ children: string[] }>(
    `${API_BASE}/children/${entityId}?linearization=${linearization}`
  );
}
