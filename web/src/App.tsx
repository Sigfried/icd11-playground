import { useState, useEffect } from "react";
import { CodingTool } from "./components/CodingTool";
import { Browser } from "./components/Browser";
import { EntityDetail } from "./components/EntityDetail";
import { QuickLookup } from "./components/QuickLookup";
import { ConfigDisplay } from "./components/ConfigDisplay";
import { getConfig, getByCode } from "./api/client";
import type { SelectedEntity } from "./types/ect";
import type { ApiConfig } from "./types/icd";
import "./App.css";

function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedFoundationUri, setSelectedFoundationUri] = useState<string | undefined>();
  const [selectedLinearizationUri, setSelectedLinearizationUri] = useState<string | undefined>();
  const [selectedFoundationId, setSelectedFoundationId] = useState<string | undefined>();
  const [selectedMmsId, setSelectedMmsId] = useState<string | undefined>();

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setConfigError(e.message))
      .finally(() => setConfigLoading(false));
  }, []);

  const handleEctSelect = (entity: SelectedEntity) => {
    setSelectedFoundationUri(entity.foundationUri);
    setSelectedLinearizationUri(entity.linearizationUri);
    setSelectedFoundationId(undefined);
    setSelectedMmsId(undefined);
  };

  const handleQuickLookup = async (type: "foundation" | "mms" | "code", value: string) => {
    setSelectedFoundationUri(undefined);
    setSelectedLinearizationUri(undefined);

    if (type === "foundation") {
      setSelectedFoundationId(value);
      setSelectedMmsId(undefined);
    } else if (type === "mms") {
      setSelectedMmsId(value);
      setSelectedFoundationId(undefined);
    } else if (type === "code") {
      try {
        const codeInfo = await getByCode(value);
        // codeInfo contains stemId which is the URI
        if (codeInfo.stemId) {
          setSelectedLinearizationUri(codeInfo.stemId);
        }
        setSelectedFoundationId(undefined);
        setSelectedMmsId(undefined);
      } catch (e) {
        console.error("Code lookup failed:", e);
      }
    }
  };

  const apiServerUrl = config?.serverUrl ?? "https://icd11restapi-developer-test.azurewebsites.net";

  return (
    <div className="app">
      <header className="app-header">
        <h1>ICD-11 Explorer</h1>
        <ConfigDisplay config={config} loading={configLoading} error={configError} />
      </header>

      <div className="app-layout">
        <aside className="left-panel">
          <section className="panel-section">
            <h2>Quick Lookup</h2>
            <QuickLookup onLookup={handleQuickLookup} />
          </section>

          <section className="panel-section">
            <h2>Search (ECT)</h2>
            <CodingTool apiServerUrl={apiServerUrl} onSelect={handleEctSelect} />
          </section>

          <section className="panel-section">
            <h2>Browse Hierarchy</h2>
            <Browser apiServerUrl={apiServerUrl} height="400px" />
          </section>
        </aside>

        <main className="main-panel">
          <h2>Entity Details</h2>
          <EntityDetail
            foundationUri={selectedFoundationUri}
            linearizationUri={selectedLinearizationUri}
            foundationId={selectedFoundationId}
            mmsId={selectedMmsId}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
