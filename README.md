# ICD-11 Playground

Exploration tools for understanding the ICD-11 API and data model.

## API Server Options

There are three ways to access the ICD-11 API, in order of simplicity:

| Server | URL | Auth Required | Use Case |
|--------|-----|---------------|----------|
| **Test Server** | `https://icd11restapi-developer-test.azurewebsites.net` | No | Quick experiments, may have stale data |
| **Docker Local** | `http://localhost:80` | No | Heavy exploration, no rate limits |
| **Official WHO** | `https://id.who.int` | Yes (OAuth2) | Production use, authoritative data |

### Test Server (Easiest)

No setup required. Just use the URL directly:
```bash
curl "https://icd11restapi-developer-test.azurewebsites.net/icd/entity/257068234" \
  -H "Accept: application/json" \
  -H "API-Version: v2"
```

### Docker Local (Recommended for Learning)

```bash
docker run -p 80:80 \
  -e acceptLicense=true \
  -e saveAnalytics=false \
  -e include=2024-01_en \
  whoicd/icd-api
```

Then access at `http://localhost/icd/entity/257068234`

### Official WHO API (Requires Credentials)

1. Register at https://icd.who.int/icdapi
2. Get your API credentials (client_id and client_secret)
3. Create `.env` in this directory:
   ```
   client_id=your_client_id
   client_secret=your_client_secret
   ```
4. Your code must get an OAuth2 token from `https://icdaccessmanagement.who.int/connect/token`

## Running the Tools

### Python API Exploration

```bash
cd python-api-exploration
uv venv && source .venv/bin/activate
uv pip install requests python-dotenv
python explore.py  # or whatever scripts get created
```

See `icd11-api-exploration-instructions.md` for the full task spec.

### React ECT Exploration

```bash
cd react-ect-exploration
npm install
npm run dev
```

See `react-ect-exploration-instructions.md` for details on the Embedded Classification Tool.

## Learning Goals

The goal is to understand ICD-11 well enough to build tools that help authors understand existing structures when making change requests.

### Core Concepts to Learn

1. **Foundation vs Linearization (MMS)**
   - Foundation: ~85k entities, polyhierarchy (multiple parents), no codes
   - MMS: ~17k codes, single parent, mutually exclusive categories
   - The `source` property links MMS entities back to Foundation

2. **Postcoordination**
   - Stem codes: standalone diagnoses
   - Extension codes (Chapter X): add detail (severity, laterality, histopathology)
   - Clusters: stem + extensions linked together
   - Some postcoordination is mandatory ("code also")

3. **Content Model Properties**
   - `title`, `definition`, `synonym`
   - `parent`/`child` relationships
   - `postcoordinationScale` - what axes are available
   - `foundationChildElsewhere` - "gray children" that live elsewhere in MMS

### Suggested Learning Path

**Phase 1: API Familiarity**
- [ ] Fetch a few entities (Cholera: 257068234, Breast cancer: 254546711)
- [ ] Compare Foundation vs MMS representations of the same concept
- [ ] Understand what properties are available and how they're structured

**Phase 2: Hierarchy Understanding**
- [ ] Navigate parent/child relationships
- [ ] Find an entity with multiple Foundation parents, see how it linearizes to one MMS parent
- [ ] Explore "gray children" (foundationChildElsewhere)

**Phase 3: Postcoordination**
- [ ] Find entities with postcoordinationScale
- [ ] Understand which axes are required vs optional
- [ ] Explore Chapter X extension codes and how they relate to stem codes

**Phase 4: Search and Discovery**
- [ ] Use the search endpoint to find entities
- [ ] Understand code lookup vs entity lookup
- [ ] Try the ECT components (Coding Tool and Browser)

## Key Test Entities

| Description | Foundation ID | MMS Code |
|-------------|---------------|----------|
| Cholera | 257068234 | 1A00 |
| Adenocarcinoma of duodenum | 1956526085 | 2B80.00 |
| Malignant neoplasm of breast | 254546711 | 2C6Y |
| Extension Codes (Chapter X root) | 1920852714 | - |
| Severity scale values | 1806520209 | XS |

## Quick Links

- [ICD-11 Browser](https://icd.who.int/browse11) - Official web interface
- [API Documentation](https://icd.who.int/icdapi) - Official docs
- [Swagger/OpenAPI](https://id.who.int/swagger/index.html) - API spec
- [ECT Documentation](https://icd.who.int/docs/icd-api/icd11ect-1.7/ECT/) - Embedded tools

## Reference Papers

- PMID 35578335 - Overview of ICD-11 architecture
- PMID 35581649 - Postcoordination of codes
- PMID 34753461 - Extension codes
