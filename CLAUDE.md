# Claude Code Instructions for ICD-11 Foundation Visual Maintenance Tool

## Project Purpose

Build a prototype visual interface to help ICD-11 proposal authors and reviewers:
- Understand the neighborhood around proposed additions or changes
- Visualize polyhierarchy structure (concepts with multiple parents)
- See potential impacts of changes on the classification

**Central reference:** [Design Specification](icd11-visual-interface-spec.md)

## Scope

- **Foundation only** - No MMS or other linearizations/serializations
- **Frontend-first** - Full graph loaded at startup, entity details fetched on demand
- **Shareable** - Deployed to GitHub Pages via CI

## Technology Stack

- **Frontend:** React, TypeScript, Vite, pnpm
- **Graph:** graphology.js for in-memory structure
- **Visualization:** D3.js for rendering
- **Layout:** elkjs (temporary — see note below)
- **Data:** Pre-crawled Foundation graph (69k nodes) + on-demand ICD-11 API for details
- **Cache:** IndexedDB (two-tier: graph structure + entity details)

### Layout Engine Migration Plan

Currently using **elkjs** for hierarchical DAG layout. May migrate to **Python/igraph** backend because:
- igraph supports **forced vertical layering** (nodes assigned to specific layers)
- Better control over complex polyhierarchy layouts

### API Proxy (Cloudflare Worker)

For production deployment, a Cloudflare Worker (`worker/`) handles OAuth2 for the WHO API:
- Manages token acquisition and caching
- Proxies requests to `https://id.who.int`
- CORS enabled for GitHub Pages

## Future Integration

- **iCAT2 API** - Used by the [Maintenance Platform](https://icd.who.int/dev11/f/en), access pending
- **.NET Maintenance Platform** - Eventually integrate this tool into the existing platform

## Running the App

```bash
cd web && pnpm dev
```

Then open http://localhost:5173

The app loads `foundation_graph.json` from `web/public/` at startup. No Docker API needed for navigation. The API is only called on-demand for entity details (definitions, synonyms, etc.).

For local API (entity details without OAuth2):
```bash
docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api
```

On localhost, `icd11.ts` auto-detects and uses `http://localhost`. On GitHub Pages, it uses the Cloudflare Worker proxy.

## Project Structure

```
├── web/                  # React + TypeScript frontend
│   ├── public/
│   │   └── foundation_graph.json  # Pre-crawled graph (69k nodes, 11 MB)
│   └── src/
│       ├── api/
│       │   ├── foundationData.ts  # Unified data API (sync graph + async details)
│       │   ├── foundationStore.ts # IndexedDB cache (graph + entities)
│       │   └── icd11.ts           # ICD-11 REST API client
│       ├── components/   # TreeView, NodeLinkView, DetailPanel
│       ├── hooks/        # useUrlState (URL ↔ selected node sync)
│       ├── providers/    # GraphProvider (React context, UI state)
│       └── archive/      # Old ECT-based components
├── analysis/             # Python scripts for crawling & analyzing Foundation
│   ├── crawl.py          # BFS crawler + descendant stats computation
│   ├── analyze.py        # Graph metrics and visualizations
│   └── foundation_graph.json  # Source graph (copy to web/public/ after regen)
├── worker/               # Cloudflare Worker for OAuth2 proxy
├── ICD-11-notes/         # Obsidian vault with notes and papers
├── design-stuff/         # Design explorations
├── icd11-visual-interface-spec.md  # Design specification (central doc)
└── archive/              # Archived playground/exploration code
```

## Architecture

### Data flow

1. **Startup:** GraphProvider fetches `foundation_graph.json` (cached in IndexedDB after first load)
2. **Init:** `foundationData.initGraph()` builds a graphology instance with all 69k nodes and 77k edges
3. **Navigation:** Tree expand/collapse and node selection are **synchronous** — all structure is in memory
4. **Details:** When a node is selected, `getDetail()` fetches definition/synonyms from IndexedDB cache or ICD-11 API

### Three layers

1. **`foundationStore.ts`** — IndexedDB cache. Stores/retrieves graph and entity data. No logic.
2. **`foundationData.ts`** — Unified data API. Owns the graphology instance. Components call this, never graphology or IndexedDB directly.
   - Sync: `getNode()`, `getChildren()`, `getParents()`, `hasNode()`
   - Async: `getDetail()` (IndexedDB-cached API call)
   - Escape hatch: `getGraph()` for NodeLinkView's ELK layout
3. **`GraphProvider.tsx`** — React context. UI state (selection, expansion paths) and init. Exposes `foundationData` functions on context.

### Key types

- **`ConceptNode`** — Structural data from graph: id, title, parentCount, childCount, childOrder, descendantCount, maxDepth
- **`EntityDetail`** — Rich metadata from API: definition, synonyms, narrowerTerms, inclusions, exclusions, browserUrl

## API Servers

| Server | URL | Auth | Use |
|--------|-----|------|-----|
| Docker Local | `http://localhost:80` | None | Development (entity details) |
| Cloudflare Proxy | `https://icd11-proxy.sigfried-icd11.workers.dev` | Handled by worker | Production |
| Official WHO | `https://id.who.int` | OAuth2 | Direct (needs auth) |

## Test Entities

- Cholera: Foundation 257068234
- Diabetes mellitus: Foundation 1217915084
- Extension codes root: 1920852714

## Key ICD-11 Concepts

- **Foundation**: ~69k entities, polyhierarchy (DAG), no codes
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

## Regenerating the Graph

If the Foundation data needs refreshing (e.g., new ICD-11 release):

```bash
# Start Docker API
docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api

# Crawl and compute stats
cd analysis && uv run crawl.py

# Or just recompute stats on existing data
cd analysis && uv run crawl.py --stats-only

# Copy to web
cp analysis/foundation_graph.json web/public/
```

## Graphology Usage

**Use graphology's built-in methods** instead of manual traversal. Key methods for this project:
- `graph.inNeighbors(id)` → parent nodes
- `graph.outNeighbors(id)` → child nodes
- `graph.inDegree(id)` / `graph.outDegree(id)` → counts
- `graph.forEachInNeighbor()` / `graph.forEachOutNeighbor()` → iteration
- See full reference: `.claude/projects/.../memory/graphology-cheatsheet.md`

**Caveat:** Components should use `foundationData` functions rather than raw graphology calls. Only NodeLinkView uses `getGraph()` directly for ELK layout edge iteration.

## Foundation Root

The root entity's `@id` is `http://id.who.int/icd/entity` (no numeric suffix).
- `extractIdFromUri` returns `'root'` for it
- In the graph JSON, the root key is `"root"`

## Open Questions

1. **Canonical/linked parent distinction** - Does the public API expose this or only iCAT?
2. **iCAT2 API access** - Needed for understanding current maintenance platform capabilities

## Testing

```bash
cd web && npx vitest run     # Unit tests
cd web && pnpm build         # Typecheck + production build
```

See [Manual Test Plan](web/MANUAL-TEST-PLAN.md) for face-check testing.
