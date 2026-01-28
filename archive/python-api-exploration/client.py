"""Base API client for ICD-11 API."""

import time

import requests

try:
    from .config import get_server_url, get_api_settings, is_official_server
    from .auth import get_auth_header
    from .cache import get_cached, save_to_cache
except ImportError:
    from config import get_server_url, get_api_settings, is_official_server
    from auth import get_auth_header
    from cache import get_cached, save_to_cache


class ICD11Client:
    """HTTP client for ICD-11 API with rate limiting and caching."""

    def __init__(self, use_cache: bool = True):
        self.use_cache = use_cache
        self.base_url = get_server_url()
        self.settings = get_api_settings()
        self._last_request_time = 0
        self._min_request_interval = 0.1  # 100ms between requests

    def _get_headers(self) -> dict:
        """Build request headers."""
        headers = {
            "Accept": "application/json",
            "API-Version": self.settings["version"],
            "Accept-Language": self.settings["language"],
        }

        # Add auth header only for official server
        if is_official_server():
            headers.update(get_auth_header())

        return headers

    def _rate_limit(self):
        """Enforce minimum time between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_request_interval:
            time.sleep(self._min_request_interval - elapsed)
        self._last_request_time = time.time()

    def get(self, url: str, use_cache: bool | None = None) -> dict:
        """
        Make a GET request to the API.

        Args:
            url: Full URL or path (path will be prefixed with base_url)
            use_cache: Override instance cache setting

        Returns:
            JSON response as dict
        """
        # Handle relative paths
        if not url.startswith("http"):
            url = f"{self.base_url}{url}"

        # Check cache first
        should_cache = use_cache if use_cache is not None else self.use_cache
        if should_cache:
            cached = get_cached(url)
            if cached:
                return cached.get("data", cached)

        # Make request
        self._rate_limit()

        try:
            response = requests.get(url, headers=self._get_headers())
            response.raise_for_status()
            data = response.json()

            # Cache successful response
            if should_cache:
                save_to_cache(url, data)

            return data

        except requests.HTTPError as e:
            if e.response.status_code == 429:
                # Rate limited - back off and retry
                retry_after = int(e.response.headers.get("Retry-After", 5))
                print(f"Rate limited. Waiting {retry_after}s...")
                time.sleep(retry_after)
                return self.get(url, use_cache=use_cache)
            raise

    def foundation_url(self, entity_id: str | int) -> str:
        """Build Foundation entity URL."""
        return f"{self.base_url}/icd/entity/{entity_id}"

    def mms_url(self, entity_id: str | int) -> str:
        """Build MMS entity URL."""
        release = self.settings["mms_release"]
        return f"{self.base_url}/icd/release/11/{release}/mms/{entity_id}"

    def search_url(self, query: str) -> str:
        """Build search URL."""
        release = self.settings["mms_release"]
        return f"{self.base_url}/icd/release/11/{release}/mms/search?q={query}"

    def code_url(self, code: str) -> str:
        """Build code lookup URL."""
        release = self.settings["mms_release"]
        return f"{self.base_url}/icd/release/11/{release}/mms/codeinfo/{code}"


# Global client instance
_client: ICD11Client | None = None


def get_client(use_cache: bool = True) -> ICD11Client:
    """Get or create the global API client."""
    global _client
    if _client is None:
        _client = ICD11Client(use_cache=use_cache)
    return _client
