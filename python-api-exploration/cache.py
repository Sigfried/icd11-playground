"""Response caching for offline analysis."""

import json
from pathlib import Path
from hashlib import sha256
from datetime import datetime


CACHE_DIR = Path(__file__).parent / ".cache"


def _cache_key(url: str) -> str:
    """Generate a cache filename from URL."""
    # Use hash for safe filename
    url_hash = sha256(url.encode()).hexdigest()[:12]
    # Extract entity ID if present for readability
    parts = url.rstrip("/").split("/")
    entity_id = parts[-1] if parts[-1].isdigit() else parts[-1][:20]
    return f"{entity_id}_{url_hash}.json"


def get_cached(url: str) -> dict | None:
    """Get cached response for URL if available."""
    cache_file = CACHE_DIR / _cache_key(url)
    if cache_file.exists():
        with open(cache_file, "r") as f:
            return json.load(f)
    return None


def save_to_cache(url: str, data: dict) -> Path:
    """Save response to cache and return the cache file path."""
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / _cache_key(url)

    # Add metadata
    cached_data = {
        "_cached_at": datetime.now().isoformat(),
        "_url": url,
        "data": data,
    }

    with open(cache_file, "w") as f:
        json.dump(cached_data, f, indent=2)

    return cache_file


def clear_cache():
    """Clear all cached responses."""
    if CACHE_DIR.exists():
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
        print(f"Cleared cache directory: {CACHE_DIR}")


def list_cached() -> list[Path]:
    """List all cached files."""
    if not CACHE_DIR.exists():
        return []
    return list(CACHE_DIR.glob("*.json"))


def save_entity(entity: dict, name: str | None = None) -> Path:
    """Save an entity to a named file for later review."""
    saved_dir = Path(__file__).parent / "saved"
    saved_dir.mkdir(exist_ok=True)

    # Generate filename from entity title or provided name
    if name is None:
        title = entity.get("title", {})
        if isinstance(title, dict):
            name = title.get("@value", "unknown")
        else:
            name = str(title) or "unknown"

    # Clean filename
    name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    filename = f"{name}.json"

    filepath = saved_dir / filename
    with open(filepath, "w") as f:
        json.dump(entity, f, indent=2)

    print(f"Saved to: {filepath}")
    return filepath
