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
 * Get Foundation entity by ID
 */
export function getFoundationEntity(
  entityId: string,
  options: FetchOptions = {}
): Promise<FoundationEntity> {
  const path = entityId === 'root' ? '/icd/entity' : `/icd/entity/${entityId}`;
  return fetchJson<FoundationEntity>(path, options);
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
  const raw = text?.['@value'] ?? '';
  // Strip format indicators (e.g. "!markdown ") returned by the API
  return raw.replace(/^!markdown\s+/, '');
}

// --- Search ---

export interface SearchResult {
  id: string;
  title: string;
  highlightedTitle: string;
  score: number;
  matchedProperty?: string;
}

/** Raw shape returned by the ICD-11 search API. */
interface SearchApiResponse {
  destinationEntities?: Array<{
    id: string;
    title: string;
    score: number;
    matchingPVs?: Array<{
      propertyId: string;
      label: string;
    }>;
  }>;
}

/**
 * Search Foundation entities via the ICD-11 `/icd/entity/search` endpoint.
 *
 * Results are filtered to only include entities present in our graph.
 */
export async function searchFoundation(
  query: string,
  hasNode: (id: string) => boolean,
  options?: { properties?: string[]; flexisearch?: boolean },
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    flatResults: 'true',
    highlightingEnabled: 'true',
  });
  if (options?.properties?.length) {
    params.set('propertiesToBeSearched', options.properties.join(','));
  }
  if (options?.flexisearch) {
    params.set('useFlexisearch', 'true');
  }

  const data = await fetchJson<SearchApiResponse>(
    `/icd/entity/search?${params.toString()}`,
  );

  if (!data.destinationEntities) return [];

  const results: SearchResult[] = [];
  for (const entity of data.destinationEntities) {
    let id: string;
    try {
      id = extractIdFromUri(entity.id);
    } catch {
      continue;
    }
    if (!hasNode(id)) continue;

    // First non-Title matched property, if any
    const nonTitleMatch = entity.matchingPVs?.find(
      pv => pv.propertyId !== 'Title',
    );

    results.push({
      id,
      title: entity.title.replace(/<\/?em>/g, ''),
      highlightedTitle: entity.title,
      score: entity.score,
      matchedProperty: nonTitleMatch?.propertyId,
    });
  }

  return results;
}
