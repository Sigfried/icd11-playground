"""Configuration loader for ICD-11 API tools."""

from pathlib import Path

try:
    import tomllib
except ImportError:
    import tomli as tomllib


def load_config() -> dict:
    """Load configuration from config.toml in project root."""
    config_path = Path(__file__).parent.parent / "config.toml"
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, "rb") as f:
        return tomllib.load(f)


def get_server_url() -> str:
    """Get the active server URL based on config."""
    config = load_config()
    server_name = config["api"]["server"]
    return config["servers"][server_name]


def get_api_settings() -> dict:
    """Get API version and language settings."""
    config = load_config()
    return {
        "version": config["api"].get("version", "v2"),
        "language": config["api"].get("language", "en"),
        "mms_release": config["api"].get("mms_release", "2024-01"),
    }


def is_official_server() -> bool:
    """Check if using official WHO server (requires auth)."""
    config = load_config()
    return config["api"]["server"] == "official"
