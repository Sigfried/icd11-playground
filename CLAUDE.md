# Claude Code Instructions for ICD-11 Playground

## Project Purpose

Exploration tools to understand the ICD-11 API and data model. The end goal is building a React/TypeScript app to help authors understand existing ICD-11 structures when making change requests. But first: learning the domain.

## Current State

**Completed:**
- `config.toml` - Unified server configuration (test/docker/official)
- `notes/` - Obsidian vault with structure:
  - `learning-goals.md` - Learning path and checklist (moved from README.md)
  - `questions.md` - Open questions for exploration
  - `papers/` - For reading notes (PDFs in root `papers/` folder)
  - `concepts/` - For concept documentation
  - `explorations/` - For session logs
- `python-api-exploration/` - Python API exploration toolkit
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
- `papers/` - Research papers (PDFs)
- `.env` - API credentials (client_id, client_secret) - DO NOT COMMIT

## Next Steps

1. **Start exploring the API** using the Python toolkit
   - Follow the learning path in `notes/learning-goals.md`
   - Document findings in `notes/explorations/`

2. **Build React ECT exploration** per `react-ect-exploration-instructions.md`
   - Should read server from `config.toml`

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

## Papers to Track

User has papers in Zotero. Key PMIDs mentioned:
- 35578335 - ICD-11 architecture overview
- 35581649 - Postcoordination
- 34753461 - Extension codes
- 34753471 - Three-part model for healthcare harms
- 36894925 - Implementation studies

Need to build out a more complete paper list with reading notes.

## Technical Preferences (from user's global CLAUDE.md)

- Use ES modules, not CommonJS
- Use `uv` for Python (not pip or poetry)
- Prefer DRY code
- Run typecheck after changes (`npm run typecheck` or `npx tsc --noEmit`)
- Don't use `any` in TypeScript
- Commit but don't push without permission
