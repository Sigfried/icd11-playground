# Claude Code Instructions for ICD-11 Foundation Visual Maintenance Tool

## Project Purpose

Build a prototype visual interface to help ICD-11 proposal authors and reviewers:
- Understand the neighborhood around proposed additions or changes
- Visualize polyhierarchy structure (concepts with multiple parents)
- See potential impacts of changes on the classification

**Central reference:** [Design Specification](icd11-visual-interface-spec.md)

## Scope

- **Foundation only** - No MMS or other linearizations/serializations
- **Docker-based development** - Use local ICD-11 API container
- **Official API support** - For production use with OAuth2

## Future Integration

- **iCAT2 API** - Used by the [Maintenance Platform](https://icd.who.int/dev11/f/en), access pending
- **.NET Maintenance Platform** - Eventually integrate this tool into the existing platform

## Technology Stack

- **Frontend:** React, TypeScript, D3.js, graphology.js (Vite)
- **Backend:** FastAPI (Python) for API proxying and caching
- **Data Source:** ICD-11 API via Docker or official WHO

## Running the App

```bash
# Terminal 1: Start FastAPI backend (port 8000)
cd api && source .venv/bin/activate && uv run python main.py

# Terminal 2: Start React frontend (port 5173)
cd web && npm run dev
```

Then open http://localhost:5173

## Project Structure

```
├── web/                  # React + TypeScript frontend
├── api/                  # FastAPI backend
├── ICD-11-notes/         # Obsidian vault with notes and papers
├── design-stuff/         # Design explorations
├── icd11-visual-interface-spec.md  # Design specification (central doc)
└── archive/              # Archived playground/exploration code
```

## API Servers

| Server | URL | Auth | Use |
|--------|-----|------|-----|
| Docker Local | `http://localhost:80` | None | Development |
| Official WHO | `https://id.who.int` | OAuth2 | Production |

## Test Entities

- Cholera: Foundation 257068234
- Diabetes mellitus: Foundation 1217915084
- Extension codes root: 1920852714

## Key ICD-11 Concepts

- **Foundation**: ~85k entities, polyhierarchy (DAG), no codes
- **Canonical vs Linked parents**: Investigation needed (see design spec)
- **Postcoordination**: Stem codes + Extension codes = clusters

## Conventions

- `[sg]` in any file = question, comment, or instruction from user that Claude should address
- Commit after changes but don't push without permission

## Technical Preferences (from global CLAUDE.md)

- Use ES modules, not CommonJS
- Use `uv` for Python (not pip or poetry)
- Prefer DRY code
- Run typecheck after changes (`npm run typecheck` or `npx tsc --noEmit`)
- Don't use `any` in TypeScript
- Commit but don't push without permission

## Open Questions

1. **TypeScript API calls** - Should frontend call ICD-11 API directly or through FastAPI?
   - FastAPI provides caching and allows Python-based exploration
   - Direct calls would simplify architecture

2. **Canonical/linked parent distinction** - Does the public API expose this or only iCAT?

3. **iCAT2 API access** - Needed for understanding current maintenance platform capabilities
