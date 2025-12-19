/** ECT (Embedded Classification Tool) TypeScript declarations */

export interface ECTSettings {
  apiServerUrl: string;
  apiSecured?: boolean;
  autoBind?: boolean;

  // Classification
  icdLinearization?: "mms" | "icf" | "ichi";
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

export interface SelectedEntity {
  code: string;
  title: string;
  selectedText: string;
  foundationUri: string;
  linearizationUri: string;
  /** @deprecated use foundationUri */
  uri?: string;
  /** @deprecated use selectedText */
  bestMatchText?: string;
}

export interface ECTCallbacks {
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

export interface ECTHandler {
  configure: (settings: ECTSettings, callbacks?: ECTCallbacks) => void;
  clear: (instanceId: string) => void;
  search: (instanceId: string, searchText: string) => void;
  getSelectedEntities: (instanceId: string) => SelectedEntity[];
  overwriteSelectedEntities: (instanceId: string, entities: SelectedEntity[]) => void;
  navigate: (instanceId: string, uri: string) => void;
}

export interface ECT {
  Handler: ECTHandler;
}

declare global {
  interface Window {
    ECT: ECT;
  }
}
