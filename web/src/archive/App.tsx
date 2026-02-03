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
  const currentEntityUri = useRef<string | null>(null);
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
          currentEntityUri.current = uri || null;
        },
        browserLoadedFunction: () => {
          console.log("ECT Browser loaded");
        },
        browserChangedFunction: (browserContent: { uri?: string }) => {
          console.log("ECT Browser changed:", browserContent);
          currentEntityUri.current = browserContent?.uri || null;
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
    if (!currentEntityUri.current) {
      alert("No entity selected. Browse to an entity first.");
      return;
    }

    // Extract the entity ID from the URI
    // URI format: http://id.who.int/icd/entity/257068234
    const match = currentEntityUri.current.match(/\/(\d+)$/);
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
  }, []);

  const handleViewFoundationRoot = useCallback(() => {
    const popup = window.open(
      "",
      "foundation-viewer",
      "width=900,height=700,scrollbars=yes,resizable=yes"
    );
    if (!popup) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    popup.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ICD-11 Foundation Explorer</title>
        <style>
          html, body { height: 100%; margin: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; background: #1e1e1e; color: #d4d4d4; display: flex; flex-direction: column; box-sizing: border-box; }
          h1, h2 { color: #569cd6; margin-top: 0; }
          .breadcrumb { color: #ce9178; margin-bottom: 15px; font-size: 13px; }
          .breadcrumb a { color: #4fc1ff; cursor: pointer; }
          .breadcrumb a:hover { text-decoration: underline; }
          .entity-title { font-size: 1.5em; color: #dcdcaa; margin-bottom: 10px; }
          .entity-info { margin-bottom: 20px; }
          .children { margin-top: 20px; }
          .children h3 { color: #569cd6; }
          .child-list { list-style: none; padding: 0; }
          .child-list li { padding: 8px 12px; background: #252526; margin: 4px 0; border-radius: 4px; cursor: pointer; }
          .child-list li:hover { background: #2d2d30; }
          .child-id { color: #808080; font-size: 0.85em; margin-left: 10px; }
          pre { background: #252526; padding: 15px; border-radius: 4px; overflow: auto; flex: 1; font-size: 12px; }
          .key { color: #9cdcfe; }
          .string { color: #ce9178; }
          .number { color: #b5cea8; }
          .loading { color: #dcdcaa; }
          .error { color: #f44747; }
          .tabs { display: flex; gap: 10px; margin-bottom: 15px; }
          .tab { padding: 8px 16px; background: #252526; border: none; color: #d4d4d4; cursor: pointer; border-radius: 4px; }
          .tab.active { background: #0e639c; }
          .tab:hover:not(.active) { background: #2d2d30; }
          #content { flex: 1; display: flex; flex-direction: column; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>Foundation Explorer</h1>
        <div class="tabs">
          <button class="tab active" onclick="showTree()">Tree View</button>
          <button class="tab" onclick="showJson()">Raw JSON</button>
        </div>
        <div id="content">
          <div class="loading">Loading Foundation root...</div>
        </div>
        <script>
          let currentData = null;
          let breadcrumbs = [];

          function syntaxHighlight(json) {
            if (typeof json !== 'string') json = JSON.stringify(json, null, 2);
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(
              /("(\\\\\\\\u[a-zA-Z0-9]{4}|\\\\\\\\[^u]|[^\\\\\\\\""])*"(\\\\s*:)?|\\\\b(true|false|null)\\\\b|-?\\\\d+(?:\\\\.\\\\d*)?(?:[eE][+\\\\-]?\\\\d+)?)/g,
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

          function getTitle(data) {
            if (data.title) {
              return data.title['@value'] || data.title;
            }
            return data['@id'] || 'Unknown';
          }

          function getIdFromUri(uri) {
            const match = uri.match(/\\/(\\d+)$/);
            return match ? match[1] : uri;
          }

          function showTree() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab')[0].classList.add('active');
            renderEntity(currentData);
          }

          function showJson() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab')[1].classList.add('active');
            document.getElementById('content').innerHTML = '<pre>' + syntaxHighlight(currentData) + '</pre>';
          }

          function renderEntity(data) {
            currentData = data;
            const title = getTitle(data);
            const children = data.child || [];

            let breadcrumbHtml = breadcrumbs.map((b, i) =>
              '<a onclick="goToBreadcrumb(' + i + ')">' + b.title + '</a>'
            ).join(' > ');
            if (breadcrumbHtml) breadcrumbHtml += ' > ';

            let html = '<div class="breadcrumb">' + breadcrumbHtml + title + '</div>';
            html += '<div class="entity-title">' + title + '</div>';
            html += '<div class="entity-info">';
            html += '<div><strong>URI:</strong> ' + (data['@id'] || 'N/A') + '</div>';
            if (data.definition) {
              html += '<div style="margin-top:10px"><strong>Definition:</strong> ' + (data.definition['@value'] || data.definition) + '</div>';
            }
            html += '</div>';

            if (children.length > 0) {
              html += '<div class="children"><h3>Children (' + children.length + ')</h3>';
              html += '<ul class="child-list">';
              children.forEach(childUri => {
                const childId = getIdFromUri(childUri);
                html += '<li onclick="loadEntity(\\'' + childUri + '\\', \\'' + title.replace(/'/g, "\\\\'") + '\\')">';
                html += 'Loading...<span class="child-id">' + childId + '</span></li>';
              });
              html += '</ul></div>';
            }

            document.getElementById('content').innerHTML = html;

            // Load child titles
            children.forEach(async (childUri, i) => {
              try {
                const res = await fetch('http://localhost:8000/api/entity?uri=' + encodeURIComponent(childUri));
                const childData = await res.json();
                const childTitle = getTitle(childData);
                const items = document.querySelectorAll('.child-list li');
                if (items[i]) {
                  const childId = getIdFromUri(childUri);
                  items[i].innerHTML = childTitle + '<span class="child-id">' + childId + '</span>';
                }
              } catch (e) {
                console.error('Error loading child:', e);
              }
            });
          }

          async function loadEntity(uri, parentTitle) {
            if (parentTitle) {
              breadcrumbs.push({ uri: currentData['@id'], title: getTitle(currentData) });
            }
            document.getElementById('content').innerHTML = '<div class="loading">Loading...</div>';
            try {
              const res = await fetch('http://localhost:8000/api/entity?uri=' + encodeURIComponent(uri));
              const data = await res.json();
              renderEntity(data);
            } catch (e) {
              document.getElementById('content').innerHTML = '<div class="error">Error: ' + e.message + '</div>';
            }
          }

          async function goToBreadcrumb(index) {
            const crumb = breadcrumbs[index];
            breadcrumbs = breadcrumbs.slice(0, index);
            await loadEntity(crumb.uri);
          }

          // Load root
          loadEntity('http://id.who.int/icd/entity');
        </script>
      </body>
      </html>
    `);
    popup.document.close();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ICD-11 Explorer</h1>
        <div className="header-right">
          <button
            className="view-json-button"
            onClick={handleViewJson}
          >
            View JSON
          </button>
          <button
            className="foundation-button"
            onClick={handleViewFoundationRoot}
          >
            Foundation
          </button>
          <ConfigDisplay config={config} loading={configLoading} error={configError} />
        </div>
      </header>

      <div className="coding-tool-section">
        <label className="section-label">Coding Tool (search → select code)</label>
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

      <div className="browser-section">
        <label className="section-label">Browser (hierarchy navigation)</label>
        <div className="browser-container">
          <div className="browser">
            <div className="ctw-eb-window" data-ctw-ino="2"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
