import type { ApiConfig } from "../types/icd";

interface ConfigDisplayProps {
  config: ApiConfig | null;
  loading: boolean;
  error: string | null;
}

export function ConfigDisplay({ config, loading, error }: ConfigDisplayProps) {
  if (loading) return <div className="config-display">Loading config...</div>;
  if (error) return <div className="config-display error">Config error: {error}</div>;
  if (!config) return null;

  return (
    <div className="config-display">
      <span className="server-badge" data-server={config.server}>
        {config.server}
      </span>
      <span className="config-detail">v{config.version}</span>
      <span className="config-detail">{config.mmsRelease}</span>
    </div>
  );
}
