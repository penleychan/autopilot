/**
 * Configuration for Azure Document Intelligence processor
 */
export interface DocumentIntelligenceConfig {
  /** Azure Document Intelligence endpoint URL */
  endpoint: string;
  /** Azure Document Intelligence API key */
  apiKey: string;
}

/**
 * Represents a single page from a processed document
 */
export interface PageContent {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Extracted text content from the page */
  content: string;
  /** Page width in the original document */
  width?: number;
  /** Page height in the original document */
  height?: number;
}

/**
 * Represents a table extracted from the document
 */
export interface TableContent {
  /** Number of rows in the table */
  rowCount: number;
  /** Number of columns in the table */
  columnCount: number;
  /** Table cells as a 2D array */
  cells: string[][];
  /** Page number where the table appears */
  pageNumber?: number;
}

/**
 * Metadata about the processed document
 */
export interface DocumentMetadata {
  /** Number of pages in the document */
  pageCount: number;
  /** Document format (pdf, image, etc.) */
  format?: string;
  /** Processing model used */
  modelId: string;
  /** Processing timestamp */
  processedAt: Date;
}

/**
 * Result of document processing
 */
export interface ProcessedDocument {
  /** Full text content of the document */
  content: string;
  /** Content broken down by page */
  pages: PageContent[];
  /** Tables extracted from the document */
  tables?: TableContent[];
  /** Document metadata */
  metadata: DocumentMetadata;
}
