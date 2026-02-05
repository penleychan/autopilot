import DocumentIntelligence, {
  type AnalyzeResultOutput,
  getLongRunningPoller,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import type {
  DocumentIntelligenceConfig,
  ProcessedDocument,
  PageContent,
  TableContent,
} from "./types.js";

/**
 * Azure Document Intelligence processor for extracting text and structure from documents.
 *
 * Supports various document types including PDFs, images, Word documents, and more.
 * Uses Azure's prebuilt-layout model for general document processing.
 *
 * @example
 * ```ts
 * const processor = new AzureDocumentProcessor({
 *   endpoint: process.env.AZURE_DOC_INTELLIGENCE_ENDPOINT!,
 *   apiKey: process.env.AZURE_DOC_INTELLIGENCE_KEY!,
 * });
 *
 * // Process a document from URL
 * const result = await processor.processUrl("https://example.com/document.pdf");
 * console.log(result.content); // Full text content
 * console.log(result.pages); // Per-page content
 * console.log(result.tables); // Extracted tables
 *
 * // Process a document from buffer
 * const buffer = fs.readFileSync("document.pdf");
 * const result = await processor.processDocument(buffer);
 * ```
 */
export class AzureDocumentProcessor {
  private client: ReturnType<typeof DocumentIntelligence>;
  private modelId: string;

  constructor(config: DocumentIntelligenceConfig, modelId = "prebuilt-layout") {
    this.client = DocumentIntelligence(config.endpoint, {
      key: config.apiKey,
    });
    this.modelId = modelId;
  }

  /**
   * Process a document from a URL
   */
  async processUrl(url: string): Promise<ProcessedDocument> {
    const initialResponse = await this.client
      .path("/documentModels/{modelId}:analyze", this.modelId)
      .post({
        contentType: "application/json",
        body: {
          urlSource: url,
        },
        queryParameters: {
          outputContentFormat: "text",
        },
      });

    if (isUnexpected(initialResponse)) {
      throw new Error(
        `Failed to analyze document: ${initialResponse.body.error?.message ?? "Unknown error"}`,
      );
    }

    const poller = getLongRunningPoller(this.client, initialResponse);
    const result = await poller.pollUntilDone();

    if (isUnexpected(result)) {
      throw new Error(
        `Document analysis failed: ${result.body.error?.message ?? "Unknown error"}`,
      );
    }

    const resultBody = result.body as { analyzeResult?: AnalyzeResultOutput };
    return this.parseAnalyzeResult(resultBody.analyzeResult!);
  }

  /**
   * Process a document from a buffer
   */
  async processDocument(
    input: Buffer | Uint8Array,
    contentType = "application/pdf",
  ): Promise<ProcessedDocument> {
    const initialResponse = await this.client
      .path("/documentModels/{modelId}:analyze", this.modelId)
      .post({
        contentType: "application/octet-stream",
        body: input,
        queryParameters: {
          outputContentFormat: "text",
        },
      });

    if (isUnexpected(initialResponse)) {
      throw new Error(
        `Failed to analyze document: ${initialResponse.body.error?.message ?? "Unknown error"}`,
      );
    }

    const poller = getLongRunningPoller(this.client, initialResponse);
    const result = await poller.pollUntilDone();

    if (isUnexpected(result)) {
      throw new Error(
        `Document analysis failed: ${result.body.error?.message ?? "Unknown error"}`,
      );
    }

    const resultBody = result.body as { analyzeResult?: AnalyzeResultOutput };
    return this.parseAnalyzeResult(resultBody.analyzeResult!);
  }

  /**
   * Process a document from a base64 string
   */
  async processBase64(
    base64Data: string,
    contentType = "application/pdf",
  ): Promise<ProcessedDocument> {
    const buffer = Buffer.from(base64Data, "base64");
    return this.processDocument(buffer, contentType);
  }

  /**
   * Parse the Azure Document Intelligence analyze result into our format
   */
  private parseAnalyzeResult(result: AnalyzeResultOutput): ProcessedDocument {
    const pages: PageContent[] = [];
    const tables: TableContent[] = [];

    // Extract page content
    if (result.pages) {
      for (const page of result.pages) {
        // Build page content from lines if available
        let pageContent = "";
        if (page.lines) {
          pageContent = page.lines.map((line) => line.content).join("\n");
        }

        pages.push({
          pageNumber: page.pageNumber,
          content: pageContent,
          width: page.width,
          height: page.height,
        });
      }
    }

    // Extract tables
    if (result.tables) {
      for (const table of result.tables) {
        const cells: string[][] = [];

        // Initialize 2D array
        for (let i = 0; i < table.rowCount; i++) {
          cells.push(new Array(table.columnCount).fill(""));
        }

        // Fill in cells
        if (table.cells) {
          for (const cell of table.cells) {
            const rowIndex = cell.rowIndex;
            const colIndex = cell.columnIndex;
            if (rowIndex < table.rowCount && colIndex < table.columnCount) {
              cells[rowIndex][colIndex] = cell.content ?? "";
            }
          }
        }

        tables.push({
          rowCount: table.rowCount,
          columnCount: table.columnCount,
          cells,
          pageNumber: table.boundingRegions?.[0]?.pageNumber,
        });
      }
    }

    return {
      content: result.content ?? "",
      pages,
      tables: tables.length > 0 ? tables : undefined,
      metadata: {
        pageCount: result.pages?.length ?? 0,
        modelId: this.modelId,
        processedAt: new Date(),
      },
    };
  }
}
