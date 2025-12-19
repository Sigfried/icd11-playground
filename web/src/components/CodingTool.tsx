import { useEffect, useRef } from "react";
import type { SelectedEntity } from "../types/ect";

interface CodingToolProps {
  instanceId?: string;
  apiServerUrl: string;
  onSelect?: (entity: SelectedEntity) => void;
}

export function CodingTool({ instanceId = "1", apiServerUrl, onSelect }: CodingToolProps) {
  const initialized = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (initialized.current || !window.ECT) return;

    window.ECT.Handler.configure(
      {
        apiServerUrl,
        autoBind: true,
        popupMode: false,
        language: "en",
      },
      {
        selectedEntityFunction: (entity) => {
          console.log("ECT selected:", entity);
          onSelectRef.current?.(entity);
        },
      }
    );

    initialized.current = true;
  }, [apiServerUrl]);

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
