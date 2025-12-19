import { useState } from "react";

interface JsonViewerProps {
  data: unknown;
  title?: string;
  defaultExpanded?: boolean;
}

export function JsonViewer({ data, title, defaultExpanded = false }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (title) {
    return (
      <details open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
        <summary className="json-viewer-summary">{title}</summary>
        <pre className="json-viewer">{JSON.stringify(data, null, 2)}</pre>
      </details>
    );
  }

  return <pre className="json-viewer">{JSON.stringify(data, null, 2)}</pre>;
}
