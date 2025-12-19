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

**Other files:**
- `README.md` - Main readme with server options, running instructions
- `icd11-api-exploration-instructions.md` - Original task spec (kept for reference)
- `react-ect-exploration-instructions.md` - Task spec for React ECT integration
- `.env` - API credentials (client_id, client_secret) - DO NOT COMMIT

## Observations & Decisions

- **Python REPL limitations**: Good for quick tests and with debugger, but not ideal for deep exploration of large JSON responses. Limited screen real estate in PyCharm debugger/console.
- **Browser-based exploration needed**: A web UI would be better for exploring API responses interactively.
- **Pivot the React app scope**: Instead of just embedding ECTs, expand to be an API/JSON exploration tool with FastAPI backend. Can still embed ECTs but also show raw API responses, entity details, etc.

## Next Steps

1. **Build React + FastAPI exploration app** (evolved from `react-ect-exploration-instructions.md`)
   - FastAPI backend that proxies ICD-11 API calls
   - React frontend for browsing entities, viewing JSON, exploring relationships
   - Embed ECT components where useful
   - Read server config from `config.toml`

2. **Continue domain learning** via `notes/questions.md`
   - Answer questions through exploration
   - Document findings in `notes/explorations/` or `notes/concepts/`

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
