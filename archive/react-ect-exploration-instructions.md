# React ECT Exploration - Instructions for Claude Code

## Context

I want to explore the ICD-11 Embedded Classification Tool (ECT) in a React/TypeScript environment. 

**Important distinction:** The ECT library provides TWO separate components:

| Component | Purpose | HTML Element |
|-----------|---------|--------------|
| **Embedded Coding Tool** | Search/autocomplete for finding codes | `<input>` + results `<div>` |
| **Embedded Browser** | Hierarchical tree navigation | `<div>` with tree view |

The official React samples at https://github.com/ICD-API/ECT-React-samples only show the Coding Tool. I want to use both.

## ECT Documentation Links

- Coding Tool: https://icd.who.int/docs/icd-api/icd11ect-1.7/EmbeddedCodingTool/
- Browser: https://icd.who.int/docs/icd-api/icd11ect-1.7/EmbeddedBrowser/
- Advanced Settings: https://icd.who.int/docs/icd-api/icd11ect-1.7/AdvancedSettings/

## Starting Point

Either:
1. Clone and extend the official samples: `git clone https://github.com/ICD-API/ECT-React-samples.git`
2. Create a fresh Vite + React + TypeScript project and integrate ECT

## ECT Library Integration

The ECT is loaded from WHO's CDN. In `index.html`:

```html
<head>
  <link rel="stylesheet" href="https://icdcdn.who.int/embeddedct/icd11ect-1.7.css">
</head>
<body>
  <!-- app content -->
  <script src="https://icdcdn.who.int/embeddedct/icd11ect-1.7.js"></script>
</body>
```

## HTML Structure for Both Components

```html
<!-- CODING TOOL: Search input + results dropdown -->
<input type="text" class="ctw-input" autocomplete="off" data-ctw-ino="1" placeholder="Search ICD-11...">
<div class="ctw-window" data-ctw-ino="1"></div>

<!-- BROWSER: Hierarchical tree view -->
<div class="ctw-browser" data-ctw-ino="2"></div>
```

The `data-ctw-ino` attribute is an instance ID - use different numbers for different instances.

## TypeScript Types

Create types for the ECT since it's a global JS library:

```typescript
// src/types/ect.d.ts

interface ECTSettings {
  apiServerUrl: string;
  apiSecured?: boolean;
  autoBind?: boolean;
  
  // Classification
  icdLinearization?: 'mms' | 'icf' | 'ichi';
  icdMinorVersion?: string;
  language?: string;
  
  // Coding Tool UI
  popupMode?: boolean;
  height?: string;
  wordsAvailable?: boolean;
  chaptersAvailable?: boolean;
  flexisearchAvailable?: boolean;
  
  // Browser UI  
  browserPopupMode?: boolean;
  browserHeight?: string;
  
  // Filtering
  subtreesFilter?: string;
  chaptersFilter?: string;
  
  // Misc
  sourceApp?: string;
}

interface SelectedEntity {
  code: string;
  title: string;
  selectedText: string;
  foundationUri: string;
  linearizationUri: string;
  // Deprecated (use above instead)
  uri?: string;
  bestMatchText?: string;
}

interface ECTCallbacks {
  // Coding Tool callbacks
  selectedEntityFunction?: (entity: SelectedEntity) => void;
  searchStartedFunction?: () => void;
  searchEndedFunction?: () => void;
  
  // Browser callbacks
  browserLoadedFunction?: () => void;
  browserChangedFunction?: () => void;
  
  // Auth callback (for production API)
  getNewTokenFunction?: () => Promise<string>;
}

interface ECTHandler {
  configure: (settings: ECTSettings, callbacks?: ECTCallbacks) => void;
  clear: (instanceId: string) => void;
  search: (instanceId: string, searchText: string) => void;
  getSelectedEntities: (instanceId: string) => SelectedEntity[];
  overwriteSelectedEntities: (instanceId: string, entities: SelectedEntity[]) => void;
  
  // Browser methods
  navigate: (instanceId: string, uri: string) => void;
}

interface ECT {
  Handler: ECTHandler;
}

declare global {
  interface Window {
    ECT: ECT;
  }
}

export { ECTSettings, ECTCallbacks, SelectedEntity, ECT };
```

## React Components

### 1. Coding Tool Component

```typescript
// src/components/CodingTool.tsx
import { useEffect, useRef } from 'react';
import type { SelectedEntity } from '../types/ect';

interface CodingToolProps {
  instanceId?: string;
  onSelect?: (entity: SelectedEntity) => void;
}

export function CodingTool({ instanceId = "1", onSelect }: CodingToolProps) {
  const initialized = useRef(false);
  
  useEffect(() => {
    if (initialized.current || !window.ECT) return;
    
    window.ECT.Handler.configure(
      {
        apiServerUrl: "https://icd11restapi-developer-test.azurewebsites.net",
        autoBind: true,
        popupMode: false,
        language: "en",
      },
      {
        selectedEntityFunction: (entity) => {
          console.log("Selected:", entity);
          onSelect?.(entity);
        },
      }
    );
    
    initialized.current = true;
  }, [onSelect]);
  
  return (
    <div className="coding-tool">
      <input 
        type="text" 
        className="ctw-input" 
        autoComplete="off"
        data-ctw-ino={instanceId}
        placeholder="Search ICD-11..."
      />
      <div className="ctw-window" data-ctw-ino={instanceId}></div>
    </div>
  );
}
```

### 2. Browser Component

```typescript
// src/components/Browser.tsx
import { useEffect, useRef } from 'react';

interface BrowserProps {
  instanceId?: string;
  onLoaded?: () => void;
  onChange?: () => void;
  height?: string;
}

export function Browser({ instanceId = "2", onLoaded, onChange, height = "600px" }: BrowserProps) {
  const initialized = useRef(false);
  
  useEffect(() => {
    if (initialized.current || !window.ECT) return;
    
    window.ECT.Handler.configure(
      {
        apiServerUrl: "https://icd11restapi-developer-test.azurewebsites.net",
        autoBind: true,
        browserHeight: height,
      },
      {
        browserLoadedFunction: () => {
          console.log("Browser loaded");
          onLoaded?.();
        },
        browserChangedFunction: () => {
          console.log("Browser navigated");
          onChange?.();
        },
      }
    );
    
    initialized.current = true;
  }, [onLoaded, onChange, height]);
  
  return (
    <div className="browser">
      <div className="ctw-browser" data-ctw-ino={instanceId}></div>
    </div>
  );
}
```

### 3. Combined Layout

```typescript
// src/App.tsx
import { useState } from 'react';
import { CodingTool } from './components/CodingTool';
import { Browser } from './components/Browser';
import { EntityDetail } from './components/EntityDetail';
import type { SelectedEntity } from './types/ect';

export function App() {
  const [selected, setSelected] = useState<SelectedEntity | null>(null);
  
  return (
    <div className="app">
      <div className="left-panel">
        <h2>Search</h2>
        <CodingTool onSelect={setSelected} />
        
        <h2>Browse Hierarchy</h2>
        <Browser height="400px" />
      </div>
      
      <div className="right-panel">
        <h2>Selected Entity</h2>
        {selected ? (
          <EntityDetail 
            foundationUri={selected.foundationUri}
            linearizationUri={selected.linearizationUri}
          />
        ) : (
          <p>Select an entity from search or browser</p>
        )}
      </div>
    </div>
  );
}
```

### 4. Entity Detail (fetches from API)

```typescript
// src/components/EntityDetail.tsx
import { useEffect, useState } from 'react';
import { getEntity } from '../api/icd11';

interface EntityDetailProps {
  foundationUri?: string;
  linearizationUri?: string;
}

export function EntityDetail({ foundationUri, linearizationUri }: EntityDetailProps) {
  const [foundationData, setFoundationData] = useState<any>(null);
  const [mmsData, setMmsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!foundationUri && !linearizationUri) return;
    
    setLoading(true);
    
    Promise.all([
      foundationUri ? getEntity(foundationUri) : Promise.resolve(null),
      linearizationUri ? getEntity(linearizationUri) : Promise.resolve(null),
    ]).then(([foundation, mms]) => {
      setFoundationData(foundation);
      setMmsData(mms);
      setLoading(false);
    });
  }, [foundationUri, linearizationUri]);
  
  if (loading) return <p>Loading...</p>;
  
  return (
    <div className="entity-detail">
      {mmsData && (
        <div>
          <h3>{mmsData.code} - {mmsData.title?.['@value']}</h3>
          <p><strong>Definition:</strong> {mmsData.definition?.['@value']}</p>
          
          {mmsData.postcoordinationScale && (
            <div>
              <h4>Postcoordination Axes</h4>
              <ul>
                {mmsData.postcoordinationScale.map((axis: any, i: number) => (
                  <li key={i}>
                    {axis.axisName.split('/').pop()}
                    {axis.requiredPostcoordination === 'true' && ' (required)'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      <details>
        <summary>Raw Foundation Data</summary>
        <pre>{JSON.stringify(foundationData, null, 2)}</pre>
      </details>
      
      <details>
        <summary>Raw MMS Data</summary>
        <pre>{JSON.stringify(mmsData, null, 2)}</pre>
      </details>
    </div>
  );
}
```

## API Client

```typescript
// src/api/icd11.ts

const TEST_API = "https://icd11restapi-developer-test.azurewebsites.net";

export async function getEntity(uri: string): Promise<any> {
  // Convert the URI to use the test API server
  const url = uri.replace("http://id.who.int", TEST_API)
                 .replace("https://id.who.int", TEST_API);
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "API-Version": "v2",
      "Accept-Language": "en"
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  return response.json();
}
```

## Environment Options

For `apiServerUrl`, in order of complexity:

1. **Test server (easiest, may be stale)**:
   `https://icd11restapi-developer-test.azurewebsites.net`

2. **Local Docker (best for heavy exploration)**:
   `http://localhost:8080` (after running `docker run -p 8080:80 -e acceptLicense=true whoicd/icd-api`)

3. **Production WHO API (requires OAuth)**:
   `https://id.who.int` with `apiSecured: true` and `getNewTokenFunction` callback

## Ideas for Further Exploration

1. **Link Coding Tool to Browser**: When user selects from search, navigate the Browser to that location using `ECT.Handler.navigate()`

2. **Postcoordination Builder**: After selecting a stem code, show available extension code axes and let user build a cluster

3. **Foundation vs MMS Comparison**: Side-by-side view showing multiple parents in Foundation vs single parent in MMS

4. **Graph Visualization**: Use vis.js or cytoscape to visualize the DAG structure

## Key Files to Create

```
react-ect-exploration/
├── src/
│   ├── types/
│   │   └── ect.d.ts           # TypeScript declarations
│   ├── api/
│   │   └── icd11.ts           # API client
│   ├── components/
│   │   ├── CodingTool.tsx     # Search widget
│   │   ├── Browser.tsx        # Tree navigation
│   │   ├── EntityDetail.tsx   # Full entity view
│   │   └── PostcoordAxes.tsx  # Extension code explorer
│   └── App.tsx                # Main layout
├── index.html                  # ECT script/css tags
└── package.json
```

## Notes

- The ECT library is loaded globally, not as an ES module
- `foundationUri` is more granular than the code - always store it
- Foundation entities can have multiple parents; MMS has exactly one
- The `data-ctw-ino` attribute links inputs/divs to ECT instances
- Call `ECT.Handler.configure()` only once per page load
