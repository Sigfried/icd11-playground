"""
ICD-11 API Exploration Toolkit

A Python toolkit for exploring the ICD-11 API, understanding the data model,
and learning the differences between Foundation and MMS linearization.

Quick Start:
    from python_api_exploration import *

    # Get an entity by Foundation ID
    cholera = get_foundation_entity(257068234)
    summarize_entity(cholera)

    # Get by MMS entity ID
    adeno = get_mms_entity(1956526085)
    summarize_entity(adeno)

    # Look up by code
    entity = get_by_code("1A00")

    # Search
    results = search("breast cancer")

    # Interactive mode
    repl()
"""

from .explore import (
    get_foundation_entity,
    get_mms_entity,
    get_by_code,
    search,
    get_children,
    get_postcoord_axes,
    summarize_entity,
    compare_foundation_mms,
    repl,
)

from .cache import save_entity, clear_cache, list_cached

from .config import get_server_url, get_api_settings, is_official_server

__all__ = [
    # Core exploration
    "get_foundation_entity",
    "get_mms_entity",
    "get_by_code",
    "search",
    "get_children",
    "get_postcoord_axes",
    # Display
    "summarize_entity",
    "compare_foundation_mms",
    # Interactive
    "repl",
    # Caching
    "save_entity",
    "clear_cache",
    "list_cached",
    # Config
    "get_server_url",
    "get_api_settings",
    "is_official_server",
]
