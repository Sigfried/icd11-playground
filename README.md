# ICD-11 Foundation Visual Maintenance Tool

A prototype visual interface to help proposal authors and reviewers understand the ICD-11 Foundation structure and the impact of proposed changes.

## Project Goals

- Expose polyhierarchy structure (concepts with multiple parents)
- Facilitate understanding of change impacts
- Support proposal authoring workflow
- Provide hierarchical visualizations (not force-directed)

See [Design Specification](icd11-visual-interface-spec.md) for detailed design documentation.

## Technology Stack

- **Frontend:** React, TypeScript, Vite, pnpm
- **Graph:** graphology.js for data structure
- **Visualization:** D3.js for rendering
- **Layout:** elkjs (temporary — may migrate to Python/igraph for better hierarchical control)
- **Data Source:** ICD-11 Foundation API
- **Future:** Integration with iCAT2 API and .NET Maintenance Platform

## Quick Links

- [ICD-11 Foundation Browser](https://icd.who.int/browse/2025-01/foundation/en)
- [ICD-11 Maintenance Platform](https://icd.who.int/dev11/f/en) (requires login)
- [ICD-11 API Documentation](https://icd.who.int/icdapi)
- [API Swagger/OpenAPI](https://id.who.int/swagger/index.html)

## Running the App

```bash
cd web && pnpm dev
```

Then open http://localhost:5173

## API Server Options

| Server | URL | Auth | Use Case |
|--------|-----|------|----------|
| **Docker Local** | `http://localhost:80` | None | Development |
| **Official WHO** | `https://id.who.int` | OAuth2 | Production/sharing |

### Docker Local (for development without OAuth2)

```bash
docker run -p 80:80 \
  -e acceptLicense=true \
  -e saveAnalytics=false \
  -e include=2024-01_en \
  whoicd/icd-api
```

Then update `web/src/api/icd11.ts` to use `http://localhost:80`.

### Official WHO API

1. Register at https://icd.who.int/icdapi
2. Get your API credentials (client_id and client_secret)
3. For browser access, will need a small backend to handle OAuth2

## Reference Papers

| Paper | Topic | Link |
|-------|-------|------|
| Harrison et al. (2021) | ICD-11 overview | [DOI](https://doi.org/10.1186/s12911-021-01534-6) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/34753471/) |
| Chute & Celik (2022) | Architecture and structure | [DOI](https://doi.org/10.1186/s12911-021-01539-1) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/35578335/) |
| Mabon et al. (2022) | Postcoordination | [DOI](https://doi.org/10.1186/s12911-022-01876-9) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/35581649/) |
| Drösler et al. (2021) | Extension codes | [DOI](https://doi.org/10.1186/s12911-021-01635-2) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/34753461/) |
| Forster et al. (2023) | Patient safety surveillance | [DOI](https://doi.org/10.1186/s12911-023-02134-2) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/36894925/) |
| Chute et al. (working paper) | ICD-11 Tooling | [SharePoint](https://livejohnshopkins-my.sharepoint.com/:w:/g/personal/cchute2_jh_edu/IQCJL-iLmb7CSqAJOlCLpLHMAWRr86gN5n2_bhuPuH8Yo_8) |
| Tudorache et al. (2013) | WebProtégé | [DOI](https://doi.org/10.3233/SW-2012-0057) \| [PubMed](https://pubmed.ncbi.nlm.nih.gov/23807872/) |

### iCAT (Collaborative Authoring Tool) References

| Paper | Link |
|-------|------|
| iCAT: A Collaborative Authoring Tool for ICD-11 (2011) | [PDF](https://ceur-ws.org/Vol-809/paper-09.pdf) |
| Supporting the Collaborative Authoring of ICD-11 with WebProtégé (2010) | [PubMed](https://pmc.ncbi.nlm.nih.gov/articles/PMC3041458/) |
| Using Semantic Web in ICD-11: Three Years Down the Road (2013) | [Springer](https://link.springer.com/chapter/10.1007/978-3-642-41338-4_13) |
| Wikipedia: ICD-11 WikiProject | [Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Medicine/ICD11) |

## Testing

See [Manual Test Plan](web/MANUAL-TEST-PLAN.md) for face-check testing procedures.

## Project Structure

```
├── web/                  # React + TypeScript frontend
├── ICD-11-notes/         # Obsidian vault with notes and papers
├── design-stuff/         # Design explorations
├── icd11-visual-interface-spec.md  # Design specification
└── archive/              # Archived code (Python API, old components)
```

## Key ICD-11 Concepts

- **Foundation**: ~85k entities, polyhierarchy (DAG), no codes
- **Linearizations** (e.g., MMS): Derived single-parent trees with codes
- **Postcoordination**: Stem codes + Extension codes = clusters
- **`source` property**: Links linearization entities back to Foundation
