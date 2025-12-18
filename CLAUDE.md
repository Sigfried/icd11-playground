# Claude Code Instructions for ICD-11 Playground

## Project Purpose

Exploration tools to understand the ICD-11 API and data model. The end goal is building a React/TypeScript app to help authors understand existing ICD-11 structures when making change requests. But first: learning the domain.

## Current State

**Existing files:**
- `README.md` - Main readme with server options, running instructions, learning path
- `icd11-api-exploration-instructions.md` - Task spec for building Python API exploration tools
- `react-ect-exploration-instructions.md` - Task spec for React Embedded Classification Tool integration
- `icd11-playground-readme.md` - Original Claude-generated overview (somewhat redundant with README.md now)
- `.env` - API credentials (client_id, client_secret) - DO NOT COMMIT

**Not yet created:**
- `python-api-exploration/` - The actual Python tools
- `react-ect-exploration/` - The actual React app
- `config.toml` - Unified server configuration
- `notes/` - Obsidian vault for research notes

## Next Steps

1. **Create `config.toml`** for server selection:
- [sg] already done
   ```toml
   [api]
   server = "test"  # "test", "docker", or "official"

   [servers]
   test = "https://icd11restapi-developer-test.azurewebsites.net"
   docker = "http://localhost:80"
   official = "https://id.who.int"
   ```

2. **Create `notes/` folder** as an Obsidian vault with structure:
- [sg] the folder is created, but go ahead and create the structure and move stuff into it,
       including the Learning Goals section of README.md
   ```
   notes/
   ├── papers/           # Reading notes per paper
   ├── concepts/         # Understanding of ICD-11 concepts
   ├── explorations/     # Logs of API exploration sessions
   ├── questions.md      # Open questions
   └── pdfs/             # Optional local paper storage
   ```

3. **Build Python API exploration tools** per `icd11-api-exploration-instructions.md`
   - Auth helper, API client, exploration functions
   - Should read server from `config.toml`

4. **Build React ECT exploration** per `react-ect-exploration-instructions.md`
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
