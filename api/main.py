"""FastAPI backend for ICD-11 exploration app."""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPStatusError

from config import get_api_settings, get_server_url
from icd_client import icd_client

app = FastAPI(
    title="ICD-11 Foundation API",
    description="Backend proxy for exploring ICD-11 Foundation",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/config")
async def get_config():
    """Return current API configuration."""
    settings = get_api_settings()
    return {
        "server": settings["server"],
        "serverUrl": get_server_url(),
        "version": settings["version"],
        "language": settings["language"],
        "release": settings["release"],
    }


@app.get("/api/foundation/{entity_id}")
async def get_foundation_entity(entity_id: str):
    """Get a Foundation entity by ID."""
    try:
        path = icd_client.foundation_path(entity_id)
        return await icd_client.get(path)
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


@app.get("/api/mms/{entity_id}")
async def get_mms_entity(entity_id: str):
    """Get an MMS entity by ID or code."""
    try:
        path = icd_client.mms_path(entity_id)
        return await icd_client.get(path)
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


@app.get("/api/code/{code}")
async def get_by_code(code: str):
    """Look up entity by ICD-11 code (e.g., 1A00)."""
    try:
        path = icd_client.code_path(code)
        return await icd_client.get(path)
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


@app.get("/api/search")
async def search(q: str = Query(..., description="Search query")):
    """Search MMS entities."""
    try:
        path = icd_client.search_path(q)
        return await icd_client.get(path)
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


@app.get("/api/children/{entity_id}")
async def get_children(entity_id: str, linearization: str = "mms"):
    """Get children of an entity."""
    try:
        if linearization == "foundation":
            path = icd_client.foundation_path(entity_id)
        else:
            path = icd_client.mms_path(entity_id)
        data = await icd_client.get(path)
        return {"children": data.get("child", [])}
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


@app.get("/api/entity")
async def get_entity_by_uri(uri: str = Query(..., description="Full entity URI")):
    """Fetch any entity by its full URI (Foundation or MMS)."""
    try:
        # The ICD-11 API returns URIs like http://id.who.int/icd/entity/123
        # We need to transform these to use our configured server
        base = get_server_url()
        if uri.startswith("http://id.who.int"):
            uri = uri.replace("http://id.who.int", base)
        elif uri.startswith("https://id.who.int"):
            uri = uri.replace("https://id.who.int", base)
        return await icd_client.get(uri)
    except HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
