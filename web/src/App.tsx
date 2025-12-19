import { useState, useEffect, useCallback, useRef } from "react";
import { ConfigDisplay } from "./components/ConfigDisplay";
import { getConfig } from "./api/client";
import type { SelectedEntity } from "./types/ect";
import type { ApiConfig } from "./types/icd";
import "./App.css";

function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [currentEntityUri, setCurrentEntityUri] = useState<string | null>(null);
  const ectInitialized = useRef(false);

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setConfigError(e.message))
      .finally(() => setConfigLoading(false));
  }, []);

  // Initialize ECT once when config is loaded
  useEffect(() => {
    if (ectInitialized.current || !config || !window.ECT) return;

    const apiServerUrl = config.serverUrl ?? "https://icd11restapi-developer-test.azurewebsites.net";

    window.ECT.Handler.configure(
      {
        apiServerUrl,
        autoBind: false,
        language: "en",
      },
      {
        selectedEntityFunction: (entity: SelectedEntity) => {
          console.log("ECT selected:", entity);
          const uri = entity.linearizationUri || entity.foundationUri;
          if (uri && window.ECT?.Handler?.setBrowserUri) {
            window.ECT.Handler.setBrowserUri("2", uri);
          }
          setCurrentEntityUri(uri || null);
        },
        browserLoadedFunction: () => {
          console.log("ECT Browser loaded");
        },
        browserChangedFunction: (browserContent: { uri?: string }) => {
          console.log("ECT Browser changed:", browserContent);
          setCurrentEntityUri(browserContent?.uri || null);
        },
      }
    );

    // Manually bind after React renders the DOM elements
    setTimeout(() => {
      window.ECT?.Handler?.bind("1"); // Coding tool
      window.ECT?.Handler?.bind("2"); // Browser
    }, 100);

    ectInitialized.current = true;
  }, [config]);

  const handleViewJson = useCallback(() => {
    if (!currentEntityUri) {
      alert("No entity selected. Browse to an entity first.");
      return;
    }

    // Extract the entity ID from the URI
    // URI format: http://id.who.int/icd/entity/257068234
    const match = currentEntityUri.match(/\/(\d+)$/);
    if (!match) {
      alert("Could not extract entity ID from URI");
      return;
    }
    const entityId = match[1];

    // Open popup with JSON viewer
    const popup = window.open(
      "",
      "json-viewer",
      "width=800,height=600,scrollbars=yes,resizable=yes"
    );
    if (!popup) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    popup.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ICD-11 JSON Viewer</title>
        <style>
          body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #d4d4d4; margin: 0; }
          h2 { color: #569cd6; margin-top: 0; }
          .url { color: #ce9178; word-break: break-all; margin-bottom: 10px; font-size: 12px; }
          .section { margin-bottom: 30px; }
          pre { background: #252526; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px; }
          .loading { color: #dcdcaa; }
          .error { color: #f44747; }
          .key { color: #9cdcfe; }
          .string { color: #ce9178; }
          .number { color: #b5cea8; }
          .boolean { color: #569cd6; }
          .null { color: #569cd6; }
        </style>
      </head>
      <body>
        <h1>Entity: ${entityId}</h1>
        <div id="foundation" class="section">
          <h2>Foundation Data</h2>
          <div class="url" id="foundation-url">Loading...</div>
          <pre id="foundation-json" class="loading">Loading...</pre>
        </div>
        <div id="mms" class="section">
          <h2>MMS (Linearization) Data</h2>
          <div class="url" id="mms-url">Loading...</div>
          <pre id="mms-json" class="loading">Loading...</pre>
        </div>
        <script>
          function syntaxHighlight(json) {
            if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(
              /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g,
              function(match) {
                let cls = 'number';
                if (/^"/.test(match)) {
                  if (/:$/.test(match)) cls = 'key';
                  else cls = 'string';
                } else if (/true|false/.test(match)) {
                  cls = 'boolean';
                } else if (/null/.test(match)) {
                  cls = 'null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
              }
            );
          }

          async function fetchAndDisplay(endpoint, urlEl, jsonEl) {
            const url = 'http://localhost:8000' + endpoint;
            urlEl.textContent = 'GET ' + url;
            try {
              const res = await fetch(url);
              const data = await res.json();
              jsonEl.innerHTML = syntaxHighlight(data);
              jsonEl.classList.remove('loading');
            } catch (err) {
              jsonEl.textContent = 'Error: ' + err.message;
              jsonEl.classList.remove('loading');
              jsonEl.classList.add('error');
            }
          }

          fetchAndDisplay('/api/foundation/${entityId}',
            document.getElementById('foundation-url'),
            document.getElementById('foundation-json'));
          fetchAndDisplay('/api/mms/${entityId}',
            document.getElementById('mms-url'),
            document.getElementById('mms-json'));
        </script>
      </body>
      </html>
    `);
    popup.document.close();
  }, [currentEntityUri]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ICD-11 Explorer</h1>
        <ConfigDisplay config={config} loading={configLoading} error={configError} />
      </header>

      <div className="search-bar">
        <div className="coding-tool">
          <input
            type="text"
            className="ctw-input"
            autoComplete="off"
            data-ctw-ino="1"
            placeholder="Search ICD-11..."
          />
          <div className="ctw-window" data-ctw-ino="1"></div>
        </div>
      </div>

      <div className="browser-container">
        <div className="browser">
          <div className="ctw-eb-window" data-ctw-ino="2"></div>
        </div>
      </div>

      <footer className="app-footer">
        <button
          className="view-json-button"
          onClick={handleViewJson}
          disabled={!currentEntityUri}
        >
          View JSON
        </button>
        {currentEntityUri && (
          <span className="current-entity">Current: {currentEntityUri}</span>
        )}
      </footer>
    </div>
  );
}

export default App;
