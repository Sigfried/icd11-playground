# ICD-11 Foundation Visual Maintenance Tool — Frontend

React + TypeScript + Vite application for visualizing and navigating the ICD-11 Foundation polyhierarchy.

## Architecture

See [../icd11-visual-interface-spec.md](../icd11-visual-interface-spec.md) for full design specification.

### Key Libraries

| Library | Purpose | Notes |
|---------|---------|-------|
| **graphology** | Graph data structure | Stores Foundation as polyhierarchy (DAG) |
| **D3.js** | Node-link visualization | Renders neighborhood diagram |
| **elkjs** | Hierarchical layout | Eclipse Layout Kernel for DAG layout |

### Layout Engine Note

We're currently using **elkjs** for hierarchical layout in the node-link view. May migrate to a **Python/igraph backend** for layout calculation because:

- igraph supports **forced vertical layering** (assigning nodes to specific layers)
- Better control over complex polyhierarchy layouts

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm build   # includes tsc
```

## API Access

The app auto-detects the environment:

| Environment | API | Auth |
|-------------|-----|------|
| localhost | Docker container directly | None |
| GitHub Pages | Cloudflare Worker proxy | OAuth2 (handled by worker) |

For local development:
```bash
docker run -p 80:80 -e acceptLicense=true -e include=2024-01_en whoicd/icd-api
```

For production, deploy the Cloudflare Worker in `../worker/`.

## File Structure

```
src/
├── api/
│   └── icd11.ts          # ICD-11 API client
├── components/
│   ├── TreeView.tsx      # Indented tree navigation (primary)
│   ├── NodeLinkView.tsx  # DAG visualization (secondary)
│   └── DetailPanel.tsx   # Entity metadata panel
├── providers/
│   └── GraphProvider.tsx # Graph state management
├── types/
│   ├── icd.ts            # ICD-11 API types
│   └── ect.d.ts          # (archived) ECT widget types
├── archive/              # Old components (ECT-based)
├── App.tsx
└── main.tsx
```
