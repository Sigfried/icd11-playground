import { useEffect, useRef } from "react";

interface BrowserProps {
  instanceId?: string;
  apiServerUrl: string;
  onLoaded?: () => void;
  onBrowserChange?: (uri: string | undefined) => void;
}

export function Browser({
  instanceId = "1",
  apiServerUrl,
  onLoaded,
  onBrowserChange,
}: BrowserProps) {
  const initialized = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  const onBrowserChangeRef = useRef(onBrowserChange);
  onLoadedRef.current = onLoaded;
  onBrowserChangeRef.current = onBrowserChange;

  useEffect(() => {
    if (initialized.current || !window.ECT) return;

    window.ECT.Handler.configure(
      {
        apiServerUrl,
        autoBind: true,
        language: "en",
      },
      {
        browserLoadedFunction: () => {
          console.log("ECT Browser loaded");
          onLoadedRef.current?.();
        },
        browserChangedFunction: (browserContent: { uri?: string }) => {
          console.log("ECT Browser changed:", browserContent);
          onBrowserChangeRef.current?.(browserContent?.uri);
        },
      }
    );

    initialized.current = true;
  }, [apiServerUrl]);

  return (
    <div className="browser">
      <div className="ctw-browser" data-ctw-ino={instanceId}></div>
    </div>
  );
}
