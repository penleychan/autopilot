import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { embedMany, embed } from "ai";
import { MDocument } from "@mastra/rag";
import { AzureDocumentProcessor } from "@repo/document-intelligence";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import type { AzureAISearchVector } from "@repo/azure-ai-search";

// Use OpenAI embedding model through Mastra's model router
// Mastra auto-detects API keys from OPENAI_API_KEY env var
const embeddingModel = new ModelRouterEmbeddingModel(
  "openai/text-embedding-3-large",
);

/**
 * Tool for ingesting documents into the RAG knowledge base.
 * Uses Azure Document Intelligence to extract text and Azure AI Search for vector storage.
 */
export const ingestDocumentTool = createTool({
  id: "ingest-document",
  description:
    "Process and index a document (PDF, image, or text) into the knowledge base for RAG",
  inputSchema: z.object({
    documentUrl: z
      .string()
      .url()
      .describe("URL of the document to ingest (PDF, image, etc.)"),
    indexName: z
      .string()
      .default("documents")
      .describe("Name of the vector index to store the document in"),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Additional metadata to attach to the document chunks"),
  }),
  execute: async (input, executionContext) => {
    const { documentUrl, indexName, metadata } = input;
    const { mastra } = executionContext;

    if (!mastra) {
      throw new Error("Mastra instance is required");
    }

    const vectors = mastra.getVectors();
    if (!vectors || !vectors.azureSearch) {
      throw new Error("Azure Search vector store not configured");
    }

    const vectorStore = vectors.azureSearch as AzureAISearchVector;

    // Step 1: Process document with Azure Document Intelligence
    const docProcessor = new AzureDocumentProcessor({
      endpoint: process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT!,
      apiKey: process.env.AZURE_DOC_INTELLIGENCE_KEY!,
    });

    const processedDoc = await docProcessor.processUrl(documentUrl);

    // Step 2: Chunk the document content
    const doc = MDocument.fromText(processedDoc.content);
    const chunks = await doc.chunk({
      strategy: "recursive",
      maxSize: 512,
      overlap: 50,
    });

    // Step 3: Generate embeddings using Mastra's model router
    const { embeddings } = await embedMany({
      model: embeddingModel as unknown as Parameters<
        typeof embedMany
      >[0]["model"],
      values: chunks.map((chunk: { text: string }) => chunk.text),
    });

    // Step 4: Ensure index exists
    const indexes = await vectorStore.listIndexes();
    if (!indexes.includes(indexName)) {
      await vectorStore.createIndex({
        indexName,
        dimension: embeddings[0].length,
        metric: "cosine",
      });
    }

    // Step 5: Upsert vectors with metadata
    const metadataArray = chunks.map((chunk: { text: string }, i: number) => ({
      text: chunk.text,
      source: documentUrl,
      pageNumber: processedDoc.pages[0]?.pageNumber ?? 1,
      chunkIndex: i,
      ...metadata,
    }));

    const ids = await vectorStore.upsert({
      indexName,
      vectors: embeddings,
      metadata: metadataArray,
    });

    return {
      success: true,
      documentUrl,
      indexName,
      chunksIngested: chunks.length,
      vectorIds: ids,
      pageCount: processedDoc.metadata.pageCount,
    };
  },
});

/**
 * Tool for searching documents in the RAG knowledge base.
 */
export const searchDocumentsTool = createTool({
  id: "search-documents",
  description:
    "Search the knowledge base for documents relevant to a query using semantic similarity",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    indexName: z
      .string()
      .default("documents")
      .describe("Name of the vector index to search in"),
    topK: z.number().default(5).describe("Number of results to return"),
  }),
  execute: async (input, executionContext) => {
    const { query, indexName, topK } = input;
    const { mastra } = executionContext;

    if (!mastra) {
      throw new Error("Mastra instance is required");
    }

    const vectors = mastra.getVectors();
    if (!vectors || !vectors.azureSearch) {
      throw new Error("Azure Search vector store not configured");
    }

    const vectorStore = vectors.azureSearch as AzureAISearchVector;

    // Generate embedding for the query
    const { embedding } = await embed({
      model: embeddingModel as unknown as Parameters<typeof embed>[0]["model"],
      value: query,
    });

    // Search for similar vectors
    const results = await vectorStore.query({
      indexName,
      queryVector: embedding,
      topK,
    });

    return {
      query,
      results: results.map(
        (r: {
          id: string;
          score: number;
          metadata?: Record<string, unknown>;
        }) => ({
          id: r.id,
          score: r.score,
          text: r.metadata?.text,
          source: r.metadata?.source,
          metadata: r.metadata,
        }),
      ),
    };
  },
});

/**
 * Tool for listing available indexes in the knowledge base.
 */
export const listIndexesTool = createTool({
  id: "list-indexes",
  description: "List all available vector indexes in the knowledge base",
  inputSchema: z.object({}),
  execute: async (_input, executionContext) => {
    const { mastra } = executionContext;

    if (!mastra) {
      throw new Error("Mastra instance is required");
    }

    const vectors = mastra.getVectors();
    if (!vectors || !vectors.azureSearch) {
      throw new Error("Azure Search vector store not configured");
    }

    const vectorStore = vectors.azureSearch as AzureAISearchVector;
    const indexes = await vectorStore.listIndexes();

    const indexStats = await Promise.all(
      indexes.map(async (name: string) => {
        try {
          const stats = await vectorStore.describeIndex({
            indexName: name,
          });
          return { name, ...stats };
        } catch {
          return { name, dimension: 0, count: 0 };
        }
      }),
    );

    return { indexes: indexStats };
  },
});
