/** ICD-11 API response types */

export interface LocalizedText {
  "@language": string;
  "@value": string;
}

export interface PostcoordinationAxis {
  axisName: string;
  requiredPostcoordination?: string;
  allowMultipleValues?: string;
  scaleEntity?: string[];
}

export interface BaseEntity {
  "@context": string;
  "@id": string;
  title: LocalizedText;
  definition?: LocalizedText;
  longDefinition?: LocalizedText;
  fullySpecifiedName?: LocalizedText;
  parent?: string[];
  child?: string[];
  synonym?: LocalizedText[];
  narrowerTerm?: LocalizedText[];
  inclusion?: LocalizedText[];
  exclusion?: ExclusionTerm[];
  browserUrl?: string;
}

export interface ExclusionTerm {
  label: LocalizedText;
  foundationReference?: string;
  linearizationReference?: string;
}

export interface FoundationEntity extends BaseEntity {
  // Foundation-specific: can have multiple parents
}

export interface MMSEntity extends BaseEntity {
  code?: string;
  codingNote?: LocalizedText;
  classKind?: string;
  source?: string; // Link back to Foundation
  postcoordinationScale?: PostcoordinationAxis[];
  indexTerm?: LocalizedText[];
}

export interface SearchResult {
  destinationEntities: DestinationEntity[];
  error: boolean;
  errorMessage?: string;
  resultChopped: boolean;
  wordSuggestionsChopped: boolean;
  guessType: number;
  uniqueSearchId: string;
  words?: WordSuggestion[];
}

export interface DestinationEntity {
  id: string;
  title: string;
  stemId: string;
  isLeaf: boolean;
  postcoordinationAvailability: number;
  hasCodingNote: boolean;
  hasMaternalChapterLink: boolean;
  matchingPVs: MatchingPV[];
  propertiesTruncated: boolean;
  isResidualOther: boolean;
  isResidualUnspecified: boolean;
  chapter: string;
  theCode: string;
  score: number;
  titleIsASearchResult: boolean;
  titleIsTopScore: boolean;
  entityType: number;
  important: boolean;
  descendants: DestinationEntity[];
}

export interface MatchingPV {
  propertyId: string;
  label: string;
  score: number;
  important: boolean;
  foundationUri?: string;
}

export interface WordSuggestion {
  label: string;
  dontChangeResult?: boolean;
}

export interface ApiConfig {
  server: string;
  serverUrl: string;
  version: string;
  language: string;
  release: string;
}
