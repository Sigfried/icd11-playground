/**
 * ICD-11 API Proxy - Cloudflare Worker
 *
 * Handles OAuth2 authentication for the WHO ICD-11 API.
 * Caches tokens to minimize auth requests.
 */

interface Env {
  WHO_API_BASE: string;
  TOKEN_URL: string;
  ICD_CLIENT_ID: string;
  ICD_CLIENT_SECRET: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// In-memory token cache (persists across requests within same isolate)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, API-Version, Accept-Language',
};

async function getAccessToken(env: Env): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const response = await fetch(env.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.ICD_CLIENT_ID,
      client_secret: env.ICD_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'icdapi_access',
    }),
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data: TokenResponse = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

async function proxyRequest(path: string, env: Env): Promise<Response> {
  const token = await getAccessToken(env);
  const url = `${env.WHO_API_BASE}${path}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'API-Version': 'v2',
      'Accept-Language': 'en',
      Authorization: `Bearer ${token}`,
    },
  });

  // Clone response with CORS headers
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          configured: Boolean(env.ICD_CLIENT_ID && env.ICD_CLIENT_SECRET),
        }),
        {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // Proxy ICD API requests
    if (path.startsWith('/icd/')) {
      try {
        return await proxyRequest(path, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
