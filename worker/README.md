# ICD-11 API Proxy (Cloudflare Worker)

OAuth2 proxy for the WHO ICD-11 API.

## Setup

```bash
cd worker
pnpm install

# Login to Cloudflare
pnpm wrangler login

# Set secrets
pnpm wrangler secret put ICD_CLIENT_ID
pnpm wrangler secret put ICD_CLIENT_SECRET

# Deploy
pnpm deploy
```

## Local Development

```bash
# Create .dev.vars with your credentials
echo "ICD_CLIENT_ID=your_id" > .dev.vars
echo "ICD_CLIENT_SECRET=your_secret" >> .dev.vars

pnpm dev
```

## Endpoints

- `GET /icd/entity` - Foundation root
- `GET /icd/entity/<id>` - Foundation entity by ID
- `GET /health` - Health check
