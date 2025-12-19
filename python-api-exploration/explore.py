"""ICD-11 API exploration functions and REPL."""

try:
    from .client import get_client
    from .cache import save_entity
except ImportError:
    from client import get_client
    from cache import save_entity


# ============================================================================
# Core Exploration Functions
# ============================================================================


def get_foundation_entity(entity_id: str | int) -> dict:
    """
    Get a Foundation entity by ID.

    The Foundation layer has ~85k entities with polyhierarchy (multiple parents).

    Example:
        >>> entity = get_foundation_entity(257068234)  # Cholera
        >>> print(entity['title']['@value'])
        Cholera
    """
    client = get_client()
    return client.get(client.foundation_url(entity_id))


def get_mms_entity(entity_id: str | int) -> dict:
    """
    Get an MMS (Mortality and Morbidity Statistics) linearization entity.

    MMS has ~17k codes with single-parent hierarchy.

    Example:
        >>> entity = get_mms_entity(1956526085)  # Adenocarcinoma of duodenum
        >>> print(entity.get('code'))
        2B80.00
    """
    client = get_client()
    return client.get(client.mms_url(entity_id))


def get_by_code(code: str) -> dict:
    """
    Look up an entity by its ICD-11 code.

    Example:
        >>> entity = get_by_code("1A00")  # Cholera
        >>> print(entity['title']['@value'])
        Cholera
    """
    client = get_client()
    code_info = client.get(client.code_url(code))

    # The codeinfo endpoint returns a pointer to the entity via stemId
    # Extract the entity ID and fetch from our configured server
    stem_id = code_info.get("stemId")
    if stem_id:
        # Extract entity ID from URL like ".../mms/257068234"
        entity_id = stem_id.rstrip("/").split("/")[-1]
        return get_mms_entity(entity_id)

    return code_info


def search(query: str) -> list:
    """
    Search for entities in MMS linearization.

    Example:
        >>> results = search("cholera")
        >>> for r in results[:3]:
        ...     print(r.get('title'))
    """
    client = get_client()
    response = client.get(client.search_url(query))

    # Search returns destinationEntities
    return response.get("destinationEntities", [])


def get_children(entity_id: str | int, foundation: bool = True) -> list:
    """
    Get children of an entity.

    Args:
        entity_id: The entity ID
        foundation: If True, get Foundation children; if False, get MMS children

    Returns:
        List of child URIs
    """
    if foundation:
        entity = get_foundation_entity(entity_id)
    else:
        entity = get_mms_entity(entity_id)

    return entity.get("child", [])


def get_postcoord_axes(entity_id: str | int) -> list:
    """
    Get postcoordination axes available for an MMS entity.

    Returns:
        List of postcoordination scales with axis info
    """
    entity = get_mms_entity(entity_id)
    scales = entity.get("postcoordinationScale", [])

    # Format for readability
    result = []
    for scale in scales:
        axis_uri = scale.get("axisName", "")
        axis_name = axis_uri.split("/")[-1] if axis_uri else "unknown"

        # requiredPostcoordination is a string "true" or "false"
        req_val = scale.get("requiredPostcoordination", "false")
        is_required = req_val == "true" or req_val is True

        result.append({
            "axis": axis_name,
            "axis_uri": axis_uri,
            "required": is_required,
            "allow_multiple": scale.get("allowMultipleValues", "NotAllowed"),
            "scale_entities": scale.get("scaleEntity", []),
        })

    return result


# ============================================================================
# Display Helpers
# ============================================================================


def _get_title(entity: dict) -> str:
    """Extract title string from entity."""
    title = entity.get("title", {})
    if isinstance(title, dict):
        return title.get("@value", "(no title)")
    return str(title) if title else "(no title)"


def _get_definition(entity: dict) -> str | None:
    """Extract definition string from entity."""
    defn = entity.get("definition", {})
    if isinstance(defn, dict):
        return defn.get("@value")
    return str(defn) if defn else None


def summarize_entity(entity: dict) -> None:
    """
    Pretty print an entity showing key properties.

    Shows: title, code, definition, parents, children count, postcoord axes
    """
    print("=" * 60)

    # Title and code
    title = _get_title(entity)
    code = entity.get("code")
    if code:
        print(f"{title} [{code}]")
    else:
        print(title)

    # Entity ID from URI
    entity_uri = entity.get("@id", "")
    entity_id = entity_uri.split("/")[-1] if entity_uri else None
    if entity_id:
        print(f"ID: {entity_id}")

    print("-" * 60)

    # Definition
    defn = _get_definition(entity)
    if defn:
        # Wrap long definitions
        if len(defn) > 80:
            words = defn.split()
            lines = []
            line = ""
            for word in words:
                if len(line) + len(word) + 1 <= 80:
                    line = f"{line} {word}".strip()
                else:
                    lines.append(line)
                    line = word
            lines.append(line)
            print("\n".join(lines))
        else:
            print(defn)
        print()

    # Class kind
    class_kind = entity.get("classKind")
    if class_kind:
        print(f"Class: {class_kind}")

    # Parents
    parents = entity.get("parent", [])
    if isinstance(parents, str):
        parents = [parents]
    if parents:
        print(f"Parents: {len(parents)}")
        for p in parents[:3]:
            parent_id = p.split("/")[-1] if isinstance(p, str) else p
            print(f"  - {parent_id}")
        if len(parents) > 3:
            print(f"  ... and {len(parents) - 3} more")

    # Children
    children = entity.get("child", [])
    if children:
        print(f"Children: {len(children)}")

    # Source (links MMS to Foundation)
    source = entity.get("source")
    if source:
        source_id = source.split("/")[-1] if isinstance(source, str) else source
        print(f"Foundation source: {source_id}")

    # Gray children
    gray = entity.get("foundationChildElsewhere", [])
    if gray:
        print(f"Gray children (elsewhere): {len(gray)}")

    # Postcoordination
    postcoord = entity.get("postcoordinationScale", [])
    if postcoord:
        print(f"\nPostcoordination axes: {len(postcoord)}")
        for pc in postcoord[:5]:
            axis = pc.get("axisName", "").split("/")[-1]
            # requiredPostcoordination is a string "true" or "false"
            req_val = pc.get("requiredPostcoordination", "false")
            required = "REQUIRED" if req_val == "true" or req_val is True else "optional"
            print(f"  - {axis} ({required})")
        if len(postcoord) > 5:
            print(f"  ... and {len(postcoord) - 5} more")

    # Exclusions
    exclusions = entity.get("exclusion", [])
    if exclusions:
        print(f"\nExclusions: {len(exclusions)}")

    print("=" * 60)


def compare_foundation_mms(foundation_id: str | int, mms_id: str | int = None) -> None:
    """
    Compare Foundation and MMS representations of an entity.

    If mms_id is not provided, attempts to find it via the Foundation entity.
    """
    print("\n### FOUNDATION ###")
    found = get_foundation_entity(foundation_id)
    summarize_entity(found)

    if mms_id:
        print("\n### MMS ###")
        mms = get_mms_entity(mms_id)
        summarize_entity(mms)

        # Show key differences
        found_parents = found.get("parent", [])
        mms_parents = mms.get("parent", [])

        if len(found_parents) != len(mms_parents):
            print(f"\n⚠ Parent count differs: Foundation={len(found_parents)}, MMS={len(mms_parents)}")


# ============================================================================
# Interactive REPL
# ============================================================================


def repl():
    """
    Start an interactive exploration session.

    Commands:
        f <id>     - Get Foundation entity
        m <id>     - Get MMS entity
        c <code>   - Get by ICD-11 code
        s <query>  - Search
        q          - Quit
    """
    print("ICD-11 API Explorer")
    print("Commands: f <id>, m <id>, c <code>, s <query>, save, q")
    print()

    last_entity = None

    while True:
        try:
            cmd = input("icd> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not cmd:
            continue

        parts = cmd.split(maxsplit=1)
        action = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else ""

        try:
            if action == "q":
                break

            elif action == "f" and arg:
                last_entity = get_foundation_entity(arg)
                summarize_entity(last_entity)

            elif action == "m" and arg:
                last_entity = get_mms_entity(arg)
                summarize_entity(last_entity)

            elif action == "c" and arg:
                last_entity = get_by_code(arg)
                summarize_entity(last_entity)

            elif action == "s" and arg:
                results = search(arg)
                print(f"Found {len(results)} results:")
                for i, r in enumerate(results[:10], 1):
                    title = r.get("title", "(no title)")
                    code = r.get("theCode", "")
                    print(f"  {i}. {title} [{code}]")

            elif action == "save":
                if last_entity:
                    save_entity(last_entity)
                else:
                    print("No entity to save. Fetch one first.")

            elif action == "help":
                print("""
Commands:
  f <id>     - Get Foundation entity by ID
  m <id>     - Get MMS entity by ID
  c <code>   - Get entity by ICD-11 code (e.g., 1A00)
  s <query>  - Search for entities
  save       - Save last fetched entity to file
  help       - Show this help
  q          - Quit

Examples:
  f 257068234     - Fetch Cholera from Foundation
  m 257068234     - Fetch Cholera from MMS
  c 1A00          - Look up code 1A00
  s breast cancer - Search for breast cancer
""")

            else:
                print("Unknown command. Try: f, m, c, s, save, q")

        except Exception as e:
            print(f"Error: {e}")


# ============================================================================
# Convenience for Jupyter
# ============================================================================


# Pre-import common functions for easy use
__all__ = [
    "get_foundation_entity",
    "get_mms_entity",
    "get_by_code",
    "search",
    "get_children",
    "get_postcoord_axes",
    "summarize_entity",
    "compare_foundation_mms",
    "save_entity",
    "repl",
]


if __name__ == "__main__":
    repl()
