import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import {
  Observability,
  DefaultExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { weatherAgent } from "./agents/weather-agent";
import { ragAgent } from "./agents/rag-agent";
import {
  toolCallAppropriatenessScorer,
  completenessScorer,
  translationScorer,
} from "./scorers/weather-scorer";
import { chatRoute } from "@mastra/ai-sdk";
import { PostgresStore } from "@mastra/pg";
import { AzureOpenAIGateway } from "@mastra/core/llm";
import { AzureAISearchVector } from "@repo/azure-ai-search";
import {
  ingestDocumentTool,
  searchDocumentsTool,
  listIndexesTool,
} from "./tools/rag-tools";

export const mastra = new Mastra({
  gateways: {
    azureOpenAI: new AzureOpenAIGateway({
      resourceName: process.env.AZURE_RESOURCE_NAME!,
      apiKey: process.env.AZURE_API_KEY!,
      deployments: ["gpt-4o", "gpt-4.1-mini", "gpt-5-nano"],
    }),
  },
  workflows: { weatherWorkflow },
  server: {
    apiRoutes: [
      chatRoute({
        path: "/chat/:agentId",
      }),
    ],
  },
  agents: { weatherAgent, ragAgent },
  // Azure AI Search vector store for RAG
  vectors: {
    azureSearch: new AzureAISearchVector({
      endpoint: process.env.AZURE_SEARCH_ENDPOINT!,
      apiKey: process.env.AZURE_SEARCH_API_KEY!,
    }),
  },
  // RAG tools for document ingestion and search
  tools: {
    ingestDocumentTool,
    searchDocumentsTool,
    listIndexesTool,
  },
  scorers: {
    toolCallAppropriatenessScorer,
    completenessScorer,
    translationScorer,
  },
  // storage: new LibSQLStore({
  //   id: "mastra-storage",
  //   // stores observability, scores, ... into file storage for persistence
  //   url: "file:./mastra.db",
  // }),
  storage: new PostgresStore({
    id: "pg-storage",
    connectionString: process.env.POSTGRES_DATABASE_URL,
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [
          new DefaultExporter(), // Uses auto-selected strategy for storage
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
