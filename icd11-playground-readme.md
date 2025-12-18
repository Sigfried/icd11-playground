# ICD-11 Playground

A multi-approach exploration of the ICD-11 API and tools.

## Project Structure

```
icd11-playground/
├── .env                          # API credentials (not committed)
├── python-api-exploration/       # Direct API exploration with Python
├── react-ect-exploration/        # Embedded Classification Tool (React/TS)
└── docker-local/                 # Local API deployment
```

## Quick Links

- [ICD-11 Browser](https://icd.who.int/browse11)
- [API Documentation](https://icd.who.int/icdapi)
- [ECT Documentation](https://icd.who.int/docs/icd-api/icd11ect-1.7/ECT/)
- [API Swagger/OpenAPI](https://id.who.int/swagger/index.html)

## Credentials Setup

1. Register at https://icd.who.int/icdapi
2. Click "View API access key" to get credentials
3. Create `.env` in repo root:

```bash
client_id=your_client_id_here
client_secret=your_client_secret_here
```

---

## 1. Python API Exploration

See `python-api-exploration/icd11-api-exploration-instructions.md` for detailed instructions.

**Quick start:**
```bash
cd python-api-exploration
pip install requests python-dotenv
# Then give instructions file to Claude Code
```

---

## 2. React ECT Exploration

The Embedded Classification Tool (ECT) library provides **two separate components**:

| Component | Purpose | What it looks like |
|-----------|---------|-------------------|
| **Embedded Coding Tool** | Search/autocomplete | Text input with dropdown results |
| **Embedded Browser** | Hierarchy navigation | Tree view like icd.who.int/browse11 |

The [ICD-API/ECT-React-samples](https://github.com/ICD-API/ECT-React-samples) repo only demonstrates the Coding Tool. See `react-ect-exploration/` for instructions on using both.

### Quick test (no setup needed)

Run the samples directly on StackBlitz (Coding Tool only):
https://stackblitz.com/~/github.com/ICD-API/ECT-React-samples

### Local setup

```bash
cd react-ect-exploration

# Clone the official samples as a starting point
git clone https://github.com/ICD-API/ECT-React-samples.git ect-samples
cd ect-samples
npm install
npm run dev
```

See `react-ect-exploration-instructions.md` for extending with the Browser component.

---

## 3. Docker Local Deployment

Running the API locally eliminates rate limits and auth hassles for exploration.

### Quick start

```bash
cd docker-local

# Basic run (latest English MMS)
docker run -p 80:80 \
  -e acceptLicense=true \
  -e saveAnalytics=false \
  whoicd/icd-api

# Then access:
# - API: http://localhost/icd/entity/257068234
# - Coding Tool: http://localhost/ct
# - Browser: http://localhost/browse
```

### Configuration options

```bash
# Specific release version
docker run -p 80:80 \
  -e include=2024-01_en \
  -e acceptLicense=true \
  -e saveAnalytics=false \
  whoicd/icd-api

# Multiple languages
docker run -p 80:80 \
  -e include=2024-01_en,2024-01_es \
  -e acceptLicense=true \
  whoicd/icd-api

# Multiple releases (for comparison)
docker run -p 80:80 \
  -e include=2024-01_en,2023-01_en \
  -e acceptLicense=true \
  whoicd/icd-api
```

### Docker Compose setup

Create `docker-local/docker-compose.yml`:

```yaml
version: '3.8'

services:
  icd-api:
    image: whoicd/icd-api
    ports:
      - "8080:80"
    environment:
      - acceptLicense=true
      - saveAnalytics=false
      - include=2024-01_en
    restart: unless-stopped
```

Then:
```bash
cd docker-local
docker-compose up -d
```

---

## Test API Server (No Auth Required)

For quick experiments without setting up OAuth or Docker:

```
https://icd11restapi-developer-test.azurewebsites.net
```

⚠️ **Warning**: This server may have outdated or incomplete data. Use only for development/testing.

Example:
```bash
curl "https://icd11restapi-developer-test.azurewebsites.net/icd/entity/257068234" \
  -H "Accept: application/json" \
  -H "API-Version: v2"
```

---

## Key Entity IDs for Testing

From the ICD-11 architecture papers:

| Description | Foundation ID | MMS Code | Notes |
|-------------|---------------|----------|-------|
| Cholera | 257068234 | 1A00 | Simple disease entity |
| Adenocarcinoma of duodenum | 1956526085 | 2B80.00 | Precoordinated example |
| Malignant neoplasm of breast | 254546711 | 2C6Y | Has postcoordination axes |
| Extension Codes (Chapter X) | 1920852714 | - | Root of extension codes |
| Severity scale | 1806520209 | XS | Extension code values |
| Tuberculosis meningitis | - | 1B10 | Multi-parent example |

---

## Architecture Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    FOUNDATION (~85k entities)                │
│                                                              │
│  • Polyhierarchy (multiple parents allowed)                  │
│  • No codes                                                  │
│  • Full content model (definitions, synonyms, etc.)          │
│  • DAG structure                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                    (linearization process)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              MMS LINEARIZATION (~17k codes)                  │
│                                                              │
│  • Single parent (mutually exclusive)                        │
│  • Has codes (e.g., 1A00, 2B80.00)                           │
│  • Residual categories (other, unspecified)                  │
│  • Tree structure                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                    (postcoordination)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              STEM CODE + EXTENSION CODES                     │
│                                                              │
│  • Stem code: standalone diagnosis                           │
│  • Extension codes (Chapter X): add detail                   │
│    - Severity, laterality, histopathology                    │
│    - Anatomy, etiology, temporality                          │
│  • Cluster: stem + extensions linked together                │
└─────────────────────────────────────────────────────────────┘
```

---

## Papers Referenced

- PMID 35578335 - Overview of ICD-11 architecture (Chute & Çelik)
- PMID 35581649 - Postcoordination of codes in ICD-11
- PMID 34753461 - ICD-11 extension codes
- PMID 34753471 - Three-part model for healthcare harms
- PMID 36894925 - ICD-11 implementation studies
