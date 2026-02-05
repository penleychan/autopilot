/**
 * Configuration for Azure AI Search vector store
 */
export interface AzureAISearchConfig {
  /** Azure AI Search service endpoint URL */
  endpoint: string;
  /** Azure AI Search admin API key */
  apiKey: string;
  /** Unique identifier for this vector store instance */
  id?: string;
}

/**
 * Azure AI Search specific filter format
 * Uses OData filter syntax for queries
 */
export interface AzureSearchFilter {
  /** Raw OData filter string for queries */
  odata?: string;
}

/**
 * Azure AI Search index configuration
 */
export interface AzureSearchIndexConfig {
  /** Name of the index */
  name: string;
  /** Vector dimension size */
  dimension: number;
  /** Distance metric for vector similarity */
  metric: "cosine" | "euclidean" | "dotproduct";
}
