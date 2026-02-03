# Claude Code Instructions for ICD-11 Foundation Visual Maintenance Tool

## Project Purpose

Build a prototype visual interface to help ICD-11 proposal authors and reviewers:
- Understand the neighborhood around proposed additions or changes
- Visualize polyhierarchy structure (concepts with multiple parents)
- See potential impacts of changes on the classification

**Central reference:** [Design Specification](icd11-visual-interface-spec.md)

## Scope

- **Foundation only** - No MMS or other linearizations/serializations
- **Frontend-first** - Direct ICD-11 API calls from browser
- **Shareable** - Colleagues need to review, so not just local dev

## Technology Stack

- **Frontend:** React, TypeScript, Vite, pnpm
- **Graph:** graphology.js for data structure
- **Visualization:** D3.js for rendering
- **Layout:** elkjs (temporary — see note below)
- **Data Source:** ICD-11 Foundation API (Docker local or official WHO)

### Layout Engine Migration Plan

Currently using **elkjs** for hierarchical DAG layout. Plan to migrate to **Python/igraph** backend because:
- igraph supports **forced vertical layering** (nodes assigned to specific layers)
- Better control over complex polyhierarchy layouts
- Backend can also handle OAuth2 and caching

If/when we add a Python backend (could run on Dreamhost), it would:
1. Handle OAuth2 for the official WHO API
2. Provide graph layout calculations via igraph
3. Cache API responses for performance

## Future Integration

- **iCAT2 API** - Used by the [Maintenance Platform](https://icd.who.int/dev11/f/en), access pending
- **.NET Maintenance Platform** - Eventually integrate this tool into the existing platform

## Running the App

```bash
cd web && pnpm dev
```

Then open http://localhost:5173

For local API without OAuth2:
```bash
docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api
```
Then update `web/src/api/icd11.ts` to use `http://localhost:80`.

## Project Structure

```
├── web/                  # React + TypeScript frontend (active)
│   └── src/
│       ├── api/          # ICD-11 API client
│       ├── components/   # TreeView, NodeLinkView, DetailPanel
│       ├── providers/    # GraphProvider (graphology state)
│       └── archive/      # Old ECT-based components
├── api/                  # FastAPI backend (dormant, may revive for igraph)
├── ICD-11-notes/         # Obsidian vault with notes and papers
├── design-stuff/         # Design explorations
├── icd11-visual-interface-spec.md  # Design specification (central doc)
└── archive/              # Archived playground/exploration code
```

## API Servers

| Server | URL | Auth | Use |
|--------|-----|------|-----|
| Docker Local | `http://localhost:80` | None | Development |
| Official WHO | `https://id.who.int` | OAuth2 | Production/sharing |

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
- Use `uv` for Python, `pnpm` for Node
- Prefer DRY code
- Run typecheck after changes (`pnpm build` includes tsc)
- Don't use `any` in TypeScript
- Commit but don't push without permission

## Open Questions

1. **Canonical/linked parent distinction** - Does the public API expose this or only iCAT?

2. **iCAT2 API access** - Needed for understanding current maintenance platform capabilities

3. **Deployment for review** - Options:
   - Static hosting + Docker API somewhere
   - Small Python backend on Dreamhost handling OAuth2
   - Wait for WHO API access

## Next Steps (Implementation)

**Current state:** Fresh component stubs created, dependencies installed, app builds and runs.

**Ready to implement (in order):**

1. **GraphProvider** - Wire up ICD-11 API calls
   - `loadNode(id)` - fetch entity from API, add to graphology graph
   - `loadChildren(id)` - fetch and add children
   - Start with Foundation root on mount

2. **TreeView** - Basic tree rendering
   - Render nodes from graph
   - Expand/collapse with lazy loading
   - Show `[N↑]` `[N↓]` badges
   - Selection state

3. **DetailPanel** - Show selected node info
   - Title, definition
   - Parent/child lists
   - Link to WHO browser

4. **NodeLinkView** - D3 + elkjs visualization
   - Render neighborhood of selected node
   - Hierarchical layout (not force-directed)
   - Click to navigate

**API notes:**
- For local dev: `docker run -p 80:80 -e acceptLicense=true whoicd/icd-api`
- Then change `API_BASE` in `web/src/api/icd11.ts` to `http://localhost:80`
- Official WHO API requires OAuth2 (need backend proxy for browser access)

**Test entities:**
- Foundation root: `/icd/entity`
- Cholera: `257068234`
- Diabetes: `1217915084`
