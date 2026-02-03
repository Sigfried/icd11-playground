"""OAuth2 authentication for official WHO ICD-11 API."""

import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")


class TokenManager:
    """Manages OAuth2 token acquisition and refresh."""

    TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"

    def __init__(self):
        self._token: str | None = None
        self._expires_at: float = 0
        self._client_id = os.getenv("ICD_CLIENT_ID", "")
        self._client_secret = os.getenv("ICD_CLIENT_SECRET", "")

    @property
    def is_configured(self) -> bool:
        """Check if credentials are configured."""
        return bool(self._client_id and self._client_secret)

    async def get_token(self) -> str:
        """Get valid access token, refreshing if needed."""
        if self._token and time.time() < self._expires_at - 60:
            return self._token

        if not self.is_configured:
            raise ValueError("ICD_CLIENT_ID and ICD_CLIENT_SECRET must be set in .env")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "grant_type": "client_credentials",
                    "scope": "icdapi_access",
                },
            )
            response.raise_for_status()
            data = response.json()

        self._token = data["access_token"]
        self._expires_at = time.time() + data.get("expires_in", 3600)
        return self._token

    async def get_auth_header(self) -> dict[str, str]:
        """Get Authorization header dict."""
        token = await self.get_token()
        return {"Authorization": f"Bearer {token}"}


# Global instance
token_manager = TokenManager()
