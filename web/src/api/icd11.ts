/**
 * ICD-11 API Client
 *
 * Direct client for the ICD-11 Foundation API.
 *
 * Environment detection:
 * - localhost: Uses Docker container directly (no auth needed)
 * - GitHub Pages: Uses proxy backend that handles OAuth2
 *
 * For local development:
 *   docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api
 *
 * See CLAUDE.md for API configuration details.
 */

const API_VERSION = 'v2';
const LANGUAGE = 'en';

// Auto-detect environment
function getApiBase(): string {
  // Allow explicit override via env var
  if (import.meta.env.VITE_ICD_API_BASE) {
    return import.meta.env.VITE_ICD_API_BASE;
  }

  // On localhost, use Docker directly
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost';
  }

  // On GitHub Pages or other deployment, use the Cloudflare Worker proxy
  return import.meta.env.VITE_ICD_API_PROXY ?? 'https://icd11-proxy.sigfried-icd11.workers.dev';
}

const API_BASE = getApiBase();

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
 * Get Foundation entity by ID (memoized — same ID returns same promise)
 */
const entityCache = new Map<string, Promise<FoundationEntity>>();

export function getFoundationEntity(
  entityId: string,
  options: FetchOptions = {}
): Promise<FoundationEntity> {
  const cached = entityCache.get(entityId);
  if (cached) return cached;

  const path = entityId === 'root' ? '/icd/entity' : `/icd/entity/${entityId}`;
  const promise = fetchJson<FoundationEntity>(path, options);
  entityCache.set(entityId, promise);
  return promise;
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

const FOUNDATION_ROOT_URI = /^https?:\/\/id\.who\.int\/icd\/entity\/?$/;

/**
 * Extract entity ID from a Foundation URI.
 * e.g., "http://id.who.int/icd/entity/1234567890" -> "1234567890"
 *       "http://id.who.int/icd/entity"            -> "root"
 */
export function extractIdFromUri(uri: string): string {
  const match = uri.match(/\/(\d+)$/);
  if (match) return match[1];
  if (FOUNDATION_ROOT_URI.test(uri)) return 'root';
  throw new Error(`Unrecognized ICD-11 entity URI: ${uri}`);
}

/**
 * Get localized text value
 */
export function getTextValue(
  text: { '@language': string; '@value': string } | undefined
): string {
  return text?.['@value'] ?? '';
}
