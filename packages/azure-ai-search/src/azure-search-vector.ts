import {
  SearchIndexClient,
  SearchClient,
  AzureKeyCredential,
  type SearchIndex,
  type SearchField,
  type VectorSearch,
  type SimpleField,
} from "@azure/search-documents";
import { MastraVector } from "@mastra/core/vector";
import type {
  CreateIndexParams,
  UpsertVectorParams,
  QueryVectorParams,
  IndexStats,
  QueryResult,
  UpdateVectorParams,
  DeleteVectorParams,
  DeleteVectorsParams,
  DescribeIndexParams,
  DeleteIndexParams,
} from "@mastra/core/vector";
import type { AzureAISearchConfig, AzureSearchFilter } from "./types.js";

/**
 * Azure AI Search vector store implementation for Mastra.
 *
 * This adapter implements the MastraVector interface to provide
 * vector similarity search capabilities using Azure AI Search.
 *
 * @example
 * ```ts
 * const vectorStore = new AzureAISearchVector({
 *   endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
 *   apiKey: process.env.AZURE_SEARCH_API_KEY!,
 * });
 *
 * // Create an index
 * await vectorStore.createIndex({
 *   indexName: "documents",
 *   dimension: 1536,
 *   metric: "cosine",
 * });
 *
 * // Upsert vectors
 * await vectorStore.upsert({
 *   indexName: "documents",
 *   vectors: embeddings,
 *   metadata: [{ text: "Hello world" }],
 * });
 *
 * // Query similar vectors
 * const results = await vectorStore.query({
 *   indexName: "documents",
 *   queryVector: queryEmbedding,
 *   topK: 5,
 * });
 * ```
 */
export class AzureAISearchVector extends MastraVector<AzureSearchFilter> {
  private indexClient: SearchIndexClient;
  private endpoint: string;
  private credential: AzureKeyCredential;
  private searchClients: Map<string, SearchClient<Record<string, unknown>>> =
    new Map();

  constructor(config: AzureAISearchConfig) {
    super({ id: config.id ?? "azure-ai-search" });
    this.endpoint = config.endpoint;
    this.credential = new AzureKeyCredential(config.apiKey);
    this.indexClient = new SearchIndexClient(this.endpoint, this.credential);
  }

  /**
   * Get or create a SearchClient for the specified index
   */
  private getSearchClient(
    indexName: string,
  ): SearchClient<Record<string, unknown>> {
    if (!this.searchClients.has(indexName)) {
      this.searchClients.set(
        indexName,
        new SearchClient<Record<string, unknown>>(
          this.endpoint,
          indexName,
          this.credential,
        ),
      );
    }
    return this.searchClients.get(indexName)!;
  }

  /**
   * Convert Mastra metric to Azure Search metric string
   */
  private mapMetric(
    metric?: "cosine" | "euclidean" | "dotproduct",
  ): "cosine" | "euclidean" | "dotProduct" {
    switch (metric) {
      case "euclidean":
        return "euclidean";
      case "dotproduct":
        return "dotProduct";
      case "cosine":
      default:
        return "cosine";
    }
  }

  /**
   * Create a new vector search index in Azure AI Search
   */
  async createIndex(params: CreateIndexParams): Promise<void> {
    const { indexName, dimension, metric = "cosine" } = params;

    const vectorSearch: VectorSearch = {
      algorithms: [
        {
          name: "hnsw-algorithm",
          kind: "hnsw",
          parameters: {
            metric: this.mapMetric(metric),
            m: 4,
            efConstruction: 400,
            efSearch: 500,
          },
        },
      ],
      profiles: [
        {
          name: "vector-profile",
          algorithmConfigurationName: "hnsw-algorithm",
        },
      ],
    };

    const fields: SearchField[] = [
      {
        name: "id",
        type: "Edm.String",
        key: true,
        filterable: true,
      } as SimpleField,
      {
        name: "vector",
        type: "Collection(Edm.Single)",
        searchable: true,
        vectorSearchDimensions: dimension,
        vectorSearchProfileName: "vector-profile",
      } as SearchField,
      {
        name: "metadata",
        type: "Edm.String",
        searchable: false,
        filterable: false,
      } as SimpleField,
      {
        name: "text",
        type: "Edm.String",
        searchable: true,
        filterable: false,
      } as SearchField,
    ];

    const index: SearchIndex = {
      name: indexName,
      fields,
      vectorSearch,
    };

    await this.indexClient.createOrUpdateIndex(index);

    // Clear cached search client if it exists (index was recreated)
    this.searchClients.delete(indexName);
  }

  /**
   * List all vector indexes in Azure AI Search
   */
  async listIndexes(): Promise<string[]> {
    const indexes: string[] = [];
    for await (const index of this.indexClient.listIndexes()) {
      indexes.push(index.name);
    }
    return indexes;
  }

  /**
   * Get statistics about an index
   */
  async describeIndex(params: DescribeIndexParams): Promise<IndexStats> {
    const { indexName } = params;

    const index = await this.indexClient.getIndex(indexName);
    const searchClient = this.getSearchClient(indexName);

    // Get document count
    const countResult = await searchClient.getDocumentsCount();

    // Find the vector field to get dimension
    let dimension = 0;
    for (const field of index.fields ?? []) {
      if (field.name === "vector" && "vectorSearchDimensions" in field) {
        dimension =
          (field as { vectorSearchDimensions?: number })
            .vectorSearchDimensions ?? 0;
        break;
      }
    }

    // Get the metric from the algorithm configuration
    let metric: "cosine" | "euclidean" | "dotproduct" = "cosine";
    const algorithm = index.vectorSearch?.algorithms?.[0];
    if (algorithm && algorithm.kind === "hnsw" && algorithm.parameters) {
      const algorithmMetric = algorithm.parameters.metric;
      if (algorithmMetric === "euclidean") metric = "euclidean";
      else if (algorithmMetric === "dotProduct") metric = "dotproduct";
    }

    return {
      dimension,
      count: countResult,
      metric,
    };
  }

  /**
   * Delete an index from Azure AI Search
   */
  async deleteIndex(params: DeleteIndexParams): Promise<void> {
    const { indexName } = params;
    await this.indexClient.deleteIndex(indexName);
    this.searchClients.delete(indexName);
  }

  /**
   * Upsert vectors with metadata into the index
   */
  async upsert(params: UpsertVectorParams): Promise<string[]> {
    const { indexName, vectors, metadata = [], ids, deleteFilter } = params;

    const searchClient = this.getSearchClient(indexName);

    // Handle deleteFilter if provided (atomic replace)
    if (deleteFilter) {
      // Convert the Mastra filter to our AzureSearchFilter format
      await this.deleteVectors({
        indexName,
        filter: { odata: String(deleteFilter) },
      });
    }

    // Prepare documents for upload
    const documents = vectors.map((vector, i) => {
      const id = ids?.[i] ?? crypto.randomUUID();
      const meta = metadata[i] ?? {};

      return {
        id,
        vector,
        metadata: JSON.stringify(meta),
        text: (meta as Record<string, unknown>).text ?? "",
      };
    });

    // Upload documents in batches of 1000
    const batchSize = 1000;
    const uploadedIds: string[] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      await searchClient.uploadDocuments(batch);
      uploadedIds.push(...batch.map((d) => d.id));
    }

    return uploadedIds;
  }

  /**
   * Query for similar vectors
   */
  async query(
    params: QueryVectorParams<AzureSearchFilter>,
  ): Promise<QueryResult[]> {
    const {
      indexName,
      queryVector,
      topK = 10,
      filter,
      includeVector = false,
    } = params;

    const searchClient = this.getSearchClient(indexName);

    // Build OData filter if provided
    let odataFilter: string | undefined;
    if (filter?.odata) {
      odataFilter = filter.odata;
    }

    const results = await searchClient.search("*", {
      vectorSearchOptions: {
        queries: [
          {
            kind: "vector",
            vector: queryVector,
            kNearestNeighborsCount: topK,
            fields: ["vector"],
          },
        ],
      },
      filter: odataFilter,
      top: topK,
      select: includeVector
        ? ["id", "metadata", "text", "vector"]
        : ["id", "metadata", "text"],
    });

    const queryResults: QueryResult[] = [];

    for await (const result of results.results) {
      const doc = result.document;
      let metadata: Record<string, unknown> = {};

      try {
        if (doc.metadata && typeof doc.metadata === "string") {
          metadata = JSON.parse(doc.metadata);
        }
      } catch {
        // Keep empty metadata if parsing fails
      }

      // Add text to metadata if present
      if (doc.text) {
        metadata.text = doc.text;
      }

      queryResults.push({
        id: doc.id as string,
        score: result.score ?? 0,
        metadata,
        vector: includeVector ? (doc.vector as number[]) : undefined,
      });
    }

    return queryResults;
  }

  /**
   * Update a single vector by ID
   */
  async updateVector(
    params: UpdateVectorParams<AzureSearchFilter>,
  ): Promise<void> {
    const { indexName, update } = params;

    if ("id" in params && params.id) {
      const searchClient = this.getSearchClient(indexName);

      const document: Record<string, unknown> = { id: params.id };

      if (update.vector) {
        document.vector = update.vector;
      }

      if (update.metadata) {
        document.metadata = JSON.stringify(update.metadata);
        if (update.metadata.text) {
          document.text = update.metadata.text;
        }
      }

      await searchClient.mergeDocuments([document]);
    } else if ("filter" in params && params.filter) {
      // For filter-based updates, we need to query and update each document
      const results = await this.query({
        indexName,
        queryVector: new Array(1536).fill(0), // Dummy vector for filter query
        topK: 10000,
        filter: params.filter,
      });

      const searchClient = this.getSearchClient(indexName);
      const documents = results.map((r) => ({
        id: r.id,
        ...(update.vector && { vector: update.vector }),
        ...(update.metadata && {
          metadata: JSON.stringify(update.metadata),
          text: update.metadata.text ?? "",
        }),
      }));

      if (documents.length > 0) {
        await searchClient.mergeDocuments(documents);
      }
    }
  }

  /**
   * Delete a single vector by ID
   */
  async deleteVector(params: DeleteVectorParams): Promise<void> {
    const { indexName, id } = params;
    const searchClient = this.getSearchClient(indexName);
    await searchClient.deleteDocuments([{ id }]);
  }

  /**
   * Delete multiple vectors by IDs or filter
   */
  async deleteVectors(
    params: DeleteVectorsParams<AzureSearchFilter>,
  ): Promise<void> {
    const { indexName, ids, filter } = params;
    const searchClient = this.getSearchClient(indexName);

    if (ids && ids.length > 0) {
      // Delete by IDs in batches
      const batchSize = 1000;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize).map((id) => ({ id }));
        await searchClient.deleteDocuments(batch);
      }
    } else if (filter) {
      // For filter-based deletes, query first then delete
      const results = await this.query({
        indexName,
        queryVector: new Array(1536).fill(0), // Dummy vector
        topK: 10000,
        filter,
      });

      if (results.length > 0) {
        const documents = results.map((r) => ({ id: r.id }));
        await searchClient.deleteDocuments(documents);
      }
    }
  }
}
