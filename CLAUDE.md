# Claude Code Instructions for ICD-11 Playground

## Project Purpose

Exploration tools to understand the ICD-11 API and data model. The end goal is building a React/TypeScript app to help authors understand existing ICD-11 structures when making change requests. But first: learning the domain.

## Current State

**Completed:**
- `config.toml` - Unified server configuration (test/docker/official)
- `notes/` - Obsidian vault with structure:
  - `questions.md` - Open questions for exploration (primary tracking file)
  - `papers/` - Reading notes and PDFs
    - `files/` - PDF files
    - `*.md` - Individual paper notes
    - `README.md` - Index with links to PDFs, PubMed, and notes
  - `concepts/` - For concept documentation
- `python-api-exploration/` - Python API exploration toolkit (all commands tested)
  - `config.py` - Reads `config.toml` for server selection
  - `auth.py` - OAuth2 token management (for official server)
  - `client.py` - HTTP client with caching and rate limiting
  - `explore.py` - Core exploration functions and REPL
  - `cache.py` - Response caching for offline analysis
  - `run.py` - Entry point
- `api/` - FastAPI backend for web exploration
  - `main.py` - API routes (config, foundation, mms, code, search, entity)
  - `icd_client.py` - Async HTTP client for ICD-11 API
  - `config.py` - Reads `config.toml` for server selection
  - `auth.py` - OAuth2 token management (for official server)
- `web/` - React + TypeScript frontend (Vite)
  - ECT integration (Coding Tool + Browser)
  - Entity detail viewer with raw JSON
  - Quick lookup by code, foundation ID, or MMS ID

**Other files:**
- `README.md` - Main readme with server options, running instructions
- `icd11-api-exploration-instructions.md` - Original task spec (kept for reference)
- `react-ect-exploration-instructions.md` - Task spec for React ECT integration
- `.env` - API credentials (client_id, client_secret) - DO NOT COMMIT

## Running the App

```bash
# Terminal 1: Start FastAPI backend (port 8000)
cd api && source .venv/bin/activate && uv run python main.py

# Terminal 2: Start React frontend (port 5173)
cd web && npm run dev
```

Then open http://localhost:5173

## Next Steps

1. **Continue domain learning** via `notes/questions.md`
   - Answer questions through exploration
   - Document findings in `notes/explorations/` or `notes/concepts/`

2. **Redesign the exploration app** (see below)

## App Redesign Plan

### Goal
Use the WHO's ECT widgets as-is (not custom entity display code), plus JSON viewing for API exploration.

### Current Architecture
- **ECT Coding Tool** (search autocomplete) → calls WHO API directly
- **ECT Browser** (hierarchy) → squeezed into sidebar, not showing full detail pane
- **Custom EntityDetail component** → calls our FastAPI backend (`/api/foundation/`, `/api/mms/`)
- **FastAPI backend** → proxies requests to WHO API, adds caching

### ECT Widget Findings

The ECT (Embedded Classification Tool) v1.7 has two main components:

1. **Coding Tool** (`ctw-input` + `ctw-window`) - Search autocomplete only
2. **Browser** (`ctw-browser`) - Full hierarchy tree + detail pane (like icd.who.int/browse)

The Browser widget, when given enough space, shows the complete entity view including:
- Fully Specified Name
- Description
- Inclusions/Exclusions
- Index Terms
- Related categories
- Postcoordination options with actual selectable values

Key settings:
- `browserHierarchyAvailable` - show/hide tree
- `includeDiagnosticCriteria` - show diagnostic criteria
- `enableSelectButton` - "none", "categories", "all", "allButRoot"
- `setBrowserUri()` / `setBrowserCode()` - programmatic navigation

Callbacks:
- `selectedEntityFunction` - user selects an entity
- `browserLoadedFunction` - browser fully loaded
- `browserChangedFunction` - displayed content changed

### The JSON Challenge

**Problem:** ECT makes API calls directly to WHO servers - we don't control them.

**Observed API calls:**
- Search: `POST /icd/release/11/{version}/mms/search`
- Entity details: Multiple calls made internally by ECT (not easily intercepted)

**Options for JSON viewing:**

1. **Proxy all ECT requests** (complex)
   - Configure ECT to point to our FastAPI backend
   - Backend proxies to WHO API and logs responses
   - Requires handling all ECT endpoints

2. **Parallel fetching** (current approach, simpler)
   - When user selects entity, fetch same data via our backend
   - Show JSON from our backend, not ECT's actual requests
   - May not capture ALL data ECT uses internally

3. **Browser DevTools integration** (out of scope)
   - Would need browser extension or similar

### Proposed New Layout

```
+------------------------------------------+
| ICD-11 Explorer          [TEST] v2024-01 |
+------------------------------------------+
|  [Search box - Coding Tool]              |
+------------------------------------------+
|                                          |
|  ECT Browser (full width/height)         |
|  - Left: hierarchy tree                  |
|  - Right: entity detail pane             |
|                                          |
+------------------------------------------+
| [View JSON] button → opens new window    |
+------------------------------------------+
```

[sg] 
the reason i suggested having a FastAPI server in the first place was because we
had made the python api explorer and wanted to be able to use it in the browser
but also have access to the full ECT views. we don't need to interfere with the
ECT's direct calling of the WHO API but we do want to make some attempt to
understand what it's doing and the kinds of results it's getting

what the actual project will be when it gets started is an aid to the ICD
maintenance platform (https://icd.who.int/dev11/f/en). i don't know what kind
of API calls that tool currently makes. there are apparently several different
types of proposal that users can author. we'll need some understanding of those.
but understanding the main API is crucial because the goal of the tool we'll
build is 
  - to help the author understand the neighborhood around whatever they are proposing
    to add or change
  - to help reviewers and approvers understand what the proposal is and how it fits
    with the current structures


### Implementation Tasks

1. **Remove custom EntityDetail component** - let ECT Browser handle display
2. **Make ECT Browser full-size** - not squeezed into sidebar
3. **Connect Coding Tool to Browser** - search selection navigates browser via `setBrowserUri()`
4. **Add "View JSON" button** - opens new window with raw API data
5. **JSON window fetches via FastAPI** - parallel fetch of foundation + MMS data
    - [sg] just realized, it might make sense instead of raw JSON view to show results
           from WHO's swagger server: https://id.who.int/swagger/. we should be able
           make the same calls to that, right?
6. **(LOW PRIORITY) Server switcher** - dropdown to change between test/docker/official

### Open Questions

- Should JSON window auto-update when browser selection changes? [sg] not necessary
- Do we need to capture search results JSON too? (highly debounced) [sg] maybe just the last search result before displaying detail
- Can we configure ECT to proxy through our backend for full request capture? [sg] let's abandon that idea

## Conventions

- `[sg]` in any file = question, comment, or instruction from user that Claude should address
- Commit after changes but don't push without permission

## Key ICD-11 Concepts (for context)

- **Foundation**: ~85k entities, polyhierarchy (DAG), no codes
- **MMS Linearization**: ~17k codes, single parent (tree), has codes like 1A00
- **Postcoordination**: Stem codes + Extension codes (Chapter X) = clusters
- **`source` property**: Links MMS entities back to Foundation

## API Servers

| Name | URL | Auth |
|------|-----|------|
| Test | `https://icd11restapi-developer-test.azurewebsites.net` | None |
| Docker | `http://localhost:80` | None |
| Official | `https://id.who.int` | OAuth2 |

## Test Entities

- Cholera: Foundation 257068234, MMS 1A00
- Breast cancer: Foundation 254546711, MMS 2C6Y
- Extension codes root: 1920852714

## Papers

See `notes/papers/README.md` for full list with links to PDFs, PubMed, and reading notes.

## Technical Preferences (from user's global CLAUDE.md)

- Use ES modules, not CommonJS
- Use `uv` for Python (not pip or poetry)
- Prefer DRY code
- Run typecheck after changes (`npm run typecheck` or `npx tsc --noEmit`)
- Don't use `any` in TypeScript
- Commit but don't push without permission
