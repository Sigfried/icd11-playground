"""OAuth2 authentication for WHO ICD-11 API."""

import time
from pathlib import Path

import requests
from dotenv import load_dotenv
import os


TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"


class TokenManager:
    """Manages OAuth2 tokens with caching and auto-refresh."""

    def __init__(self):
        self._token: str | None = None
        self._expires_at: float = 0
        self._load_credentials()

    def _load_credentials(self):
        """Load credentials from .env file in project root."""
        env_path = Path(__file__).parent.parent / ".env"
        load_dotenv(env_path)

        self.client_id = os.getenv("client_id")
        self.client_secret = os.getenv("client_secret")

        if not self.client_id or not self.client_secret:
            print("Warning: No API credentials found in .env")
            print("Official WHO API requires credentials from https://icd.who.int/icdapi")

    def get_token(self) -> str | None:
        """Get a valid token, refreshing if necessary."""
        if not self.client_id or not self.client_secret:
            return None

        # Refresh if expired or expiring within 60 seconds
        if time.time() >= self._expires_at - 60:
            self._refresh_token()

        return self._token

    def _refresh_token(self):
        """Request a new token from the OAuth2 endpoint."""
        try:
            response = requests.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "scope": "icdapi_access",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()

            data = response.json()
            self._token = data["access_token"]
            # expires_in is in seconds
            self._expires_at = time.time() + data.get("expires_in", 3600)

        except requests.RequestException as e:
            print(f"Failed to get OAuth token: {e}")
            self._token = None
            self._expires_at = 0


# Global token manager instance
_token_manager: TokenManager | None = None


def get_token_manager() -> TokenManager:
    """Get or create the global token manager."""
    global _token_manager
    if _token_manager is None:
        _token_manager = TokenManager()
    return _token_manager


def get_auth_header() -> dict:
    """Get Authorization header if credentials are available."""
    token = get_token_manager().get_token()
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}
