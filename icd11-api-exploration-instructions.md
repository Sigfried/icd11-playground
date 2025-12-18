# ICD-11 API Exploration Tool - Instructions for Claude Code

## Context

I'm exploring the ICD-11 API to understand the data model, particularly:
- The difference between Foundation entities (polyhierarchy, ~85k entities) and Linearizations (MMS, single-parent, coded)
- How the content model properties map to API responses
- How postcoordination works with stem codes and extension codes (Chapter X)

I have my WHO API credentials in `<project root>/env` with:
```
client_id=...
client_secret=...
```

## Task 1.

Build me a Python-based exploration toolkit for the ICD-11 API (put it in its
own directory, like ./python-api-exploration). Create a module or script that:

### 1. Authentication helper
- Load credentials from `.env` using `python-dotenv`
- Get OAuth2 token from `https://icdaccessmanagement.who.int/connect/token`
- Cache the token and auto-refresh when expired
- Scope is `icdapi_access`, grant_type is `client_credentials`

### 2. Base API client
- All requests need headers:
  - `Authorization: Bearer {token}`
  - `Accept: application/json`
  - `API-Version: v2`
  - `Accept-Language: en`
- Base URL for Foundation: `https://id.who.int/icd/entity/`
- Base URL for MMS linearization: `https://id.who.int/icd/release/11/2024-01/mms/`
- Handle rate limiting gracefully

### 3. Exploration functions

```python
# Get a Foundation entity by ID
def get_foundation_entity(entity_id: str) -> dict:
    """e.g., get_foundation_entity("257068234") for Cholera"""
    
# Get an MMS linearization entity by ID  
def get_mms_entity(entity_id: str) -> dict:
    """e.g., get_mms_entity("1956526085") for Adenocarcinoma of duodenum"""

# Get entity by ICD-11 code
def get_by_code(code: str) -> dict:
    """e.g., get_by_code("2B80.00") - may need to use search endpoint"""

# Search for entities
def search(query: str, linearization: str = "mms") -> list:
    """Search the coding tool / API"""

# Get children of an entity
def get_children(entity_id: str, foundation: bool = True) -> list:
    """Traverse the hierarchy"""

# Get postcoordination axes for an entity
def get_postcoord_axes(entity_id: str) -> list:
    """Extract and format the postcoordinationScale property"""

# Pretty print an entity showing key properties
def summarize_entity(entity: dict) -> None:
    """Print title, code, definition, parents, children, postcoord axes"""
```

### 4. Example entities to test with

From the ICD-11 architecture papers (PMIDs: 35578335, 35581649, 34753461):

| Description | Foundation ID | MMS ID | Code |
|-------------|---------------|--------|------|
| Cholera | 257068234 | | 1A00 |
| Adenocarcinoma of duodenum | | 1956526085 | 2B80.00 |
| Malignant neoplasm of breast | | 254546711 | 2C6Y |
| Extension Codes (Chapter X root) | | 1920852714 | |
| Severity scale values | | 1806520209 | XS |

### 5. Interactive exploration mode

Create a simple REPL or Jupyter-friendly interface where I can:
- Look up entities by ID or code
- Browse parent/child relationships
- See what postcoordination axes are available
- Compare Foundation vs MMS representations of the same concept

### 6. Save responses for offline analysis

- Cache API responses to JSON files so I don't re-fetch
- Option to dump interesting entities for later review

## Endpoints reference

```
# Foundation root
https://id.who.int/icd/entity

# Foundation entity
https://id.who.int/icd/entity/{entity_id}

# MMS linearization root
https://id.who.int/icd/release/11/2024-01/mms

# MMS entity
https://id.who.int/icd/release/11/2024-01/mms/{entity_id}

# Search (coding tool)
https://id.who.int/icd/release/11/2024-01/mms/search?q={query}

# Code lookup
https://id.who.int/icd/release/11/2024-01/mms/codeinfo/{code}
```

## Key properties to pay attention to

From the ICD Schema, these are the important ones:

**Core entity properties:**
- `title` (prefLabel)
- `definition` 
- `longDefinition`
- `fullySpecifiedName`
- `synonym` (altLabel)
- `parent` (broaderTransitive) - array in Foundation, single in MMS
- `child` (narrowerTransitive)
- `code` - only in linearizations
- `classKind` - chapter/block/category

**Postcoordination:**
- `postcoordinationScale` - array of allowed axes
  - `axisName` - URI of the axis
  - `requiredPostcoordination` - boolean
  - `allowMultipleValues` - AllowAlways/NotAllowed/AllowedExceptFromSameBlock
  - `scaleEntity` - allowed value set roots

**Linkage:**
- `source` - Foundation URI when viewing linearization
- `foundationChildElsewhere` - "gray children" in MMS that live elsewhere
- `exclusion` - cross-references

## Notes

- The Foundation has multiple parents (DAG), linearizations have single parent (tree)
- Extension codes (X chapter) can't be used alone, only with stem codes
- Some postcoordination is mandatory ("code also")
- The `source` property links MMS entities back to their Foundation counterpart
