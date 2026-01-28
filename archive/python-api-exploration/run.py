#!/usr/bin/env python3
"""
Quick entry point for running the exploration REPL.

Usage:
    cd python-api-exploration
    uv run python run.py
"""

# Use absolute imports - run from within the package directory
from config import get_server_url
from client import get_client
from cache import save_entity
from explore import (
    get_foundation_entity,
    get_mms_entity,
    get_by_code,
    search,
    summarize_entity,
    compare_foundation_mms,
    repl,
)


def main():
    print(f"ICD-11 API Explorer")
    print(f"Server: {get_server_url()}")
    print()

    # Quick test
    print("Quick test: Fetching Cholera (Foundation ID: 257068234)...")
    try:
        cholera = get_foundation_entity(257068234)
        summarize_entity(cholera)
        print("\nAPI connection working!")
    except Exception as e:
        print(f"Error: {e}")
        return

    print("\nStarting REPL. Type 'help' for commands, 'q' to quit.\n")
    repl()


if __name__ == "__main__":
    main()
