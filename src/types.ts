export interface SearchResult {
  title: string;
  url: string;
  description: string;
  fullContent: string;
  timestamp: string;
  fetchStatus: string;
  error?: string;
}

export interface SlimSearchResult {
  fullContent: string;
}

export interface SearchOptions {
  query: string;
  numResults?: number;
  timeout?: number;
}
