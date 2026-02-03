"""Async HTTP client for proxying ICD-11 API requests."""

import httpx

from config import get_server_url, get_api_settings, is_official_server
from auth import token_manager


class ICD11Client:
    """Async HTTP client for ICD-11 API."""

    def __init__(self):
        self.base_url = get_server_url()
        self.settings = get_api_settings()

    async def _get_headers(self) -> dict[str, str]:
        """Build request headers."""
        headers = {
            "Accept": "application/json",
            "API-Version": self.settings["version"],
            "Accept-Language": self.settings["language"],
        }

        if is_official_server():
            auth_header = await token_manager.get_auth_header()
            headers.update(auth_header)

        return headers

    async def get(self, path: str) -> dict:
        """Make GET request to ICD-11 API."""
        url = f"{self.base_url}{path}" if not path.startswith("http") else path
        headers = await self._get_headers()

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()

    def foundation_path(self, entity_id: str | int) -> str:
        """Build Foundation entity path."""
        return f"/icd/entity/{entity_id}"

    def mms_path(self, entity_id: str | int) -> str:
        """Build MMS entity path."""
        release = self.settings["release"]
        return f"/icd/release/11/{release}/mms/{entity_id}"

    def search_path(self, query: str) -> str:
        """Build search path."""
        release = self.settings["release"]
        return f"/icd/release/11/{release}/mms/search?q={query}"

    def code_path(self, code: str) -> str:
        """Build code lookup path."""
        release = self.settings["release"]
        return f"/icd/release/11/{release}/mms/codeinfo/{code}"


# Global client instance
icd_client = ICD11Client()
