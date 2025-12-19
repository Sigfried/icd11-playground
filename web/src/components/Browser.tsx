import { useEffect, useRef } from "react";

interface BrowserProps {
  instanceId?: string;
  apiServerUrl: string;
  height?: string;
  onLoaded?: () => void;
  onChange?: () => void;
}

export function Browser({
  instanceId = "2",
  apiServerUrl,
  height = "500px",
  onLoaded,
  onChange,
}: BrowserProps) {
  const initialized = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  const onChangeRef = useRef(onChange);
  onLoadedRef.current = onLoaded;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (initialized.current || !window.ECT) return;

    window.ECT.Handler.configure(
      {
        apiServerUrl,
        autoBind: true,
        browserHeight: height,
      },
      {
        browserLoadedFunction: () => {
          console.log("ECT Browser loaded");
          onLoadedRef.current?.();
        },
        browserChangedFunction: () => {
          console.log("ECT Browser changed");
          onChangeRef.current?.();
        },
      }
    );

    initialized.current = true;
  }, [apiServerUrl, height]);

  return (
    <div className="browser">
      <div className="ctw-browser" data-ctw-ino={instanceId}></div>
    </div>
  );
}
