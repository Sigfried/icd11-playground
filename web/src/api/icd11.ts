/**
 * ICD-11 API Client
 *
 * Direct client for the ICD-11 Foundation API.
 * Currently configured for the official WHO API (requires OAuth2 for production).
 *
 * For development without OAuth2, you can:
 * 1. Run the Docker container locally: docker run -p 80:80 -e acceptLicense=true whoicd/icd-api
 * 2. Change API_BASE to 'http://localhost:80'
 *
 * For sharing with colleagues (non-local), options:
 * 1. Deploy a small proxy on Dreamhost that handles OAuth2
 * 2. Wait for WHO to provide access
 *
 * See CLAUDE.md for API configuration details.
 */

// TODO: Make this configurable (env var or config file)
const API_BASE = 'https://id.who.int';
const API_VERSION = 'v2';
const LANGUAGE = 'en';

interface FetchOptions {
  /** OAuth2 access token (required for official WHO API) */
  accessToken?: string;
}

async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'API-Version': API_VERSION,
    'Accept-Language': LANGUAGE,
  };

  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`ICD-11 API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Foundation entity response from ICD-11 API
 */
export interface FoundationEntity {
  '@context': string;
  '@id': string;
  title: { '@language': string; '@value': string };
  definition?: { '@language': string; '@value': string };
  longDefinition?: { '@language': string; '@value': string };
  fullySpecifiedName?: { '@language': string; '@value': string };
  parent?: string[];
  child?: string[];
  synonym?: Array<{ '@language': string; '@value': string }>;
  narrowerTerm?: Array<{ '@language': string; '@value': string }>;
  inclusion?: Array<{ '@language': string; '@value': string }>;
  exclusion?: Array<{
    label: { '@language': string; '@value': string };
    foundationReference?: string;
  }>;
  browserUrl?: string;
}

/**
 * Get Foundation entity by ID
 */
export async function getFoundationEntity(
  entityId: string,
  options: FetchOptions = {}
): Promise<FoundationEntity> {
  return fetchJson(`/icd/entity/${entityId}`, options);
}

/**
 * Get Foundation root entity
 */
export async function getFoundationRoot(
  options: FetchOptions = {}
): Promise<FoundationEntity> {
  return fetchJson('/icd/entity', options);
}

/**
 * Get entity by full URI
 */
export async function getEntityByUri(
  uri: string,
  options: FetchOptions = {}
): Promise<FoundationEntity> {
  // The API returns URIs like http://id.who.int/icd/entity/123
  // We can fetch these directly
  return fetchJson(uri, options);
}

/**
 * Extract entity ID from a Foundation URI
 * e.g., "http://id.who.int/icd/entity/1234567890" -> "1234567890"
 */
export function extractIdFromUri(uri: string): string {
  const match = uri.match(/\/(\d+)$/);
  return match ? match[1] : uri;
}

/**
 * Get localized text value
 */
export function getTextValue(
  text: { '@language': string; '@value': string } | undefined
): string {
  return text?.['@value'] ?? '';
}
