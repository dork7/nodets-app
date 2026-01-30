import { StatusCodes } from 'http-status-codes';
import mammoth from 'mammoth';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';
import { callAI, customPrompts } from '@/openai';

interface ExtractTextResponse {
    text: string;
    fileName: string;
    fileType: string;
    characterCount: number;
}

interface ChromaDBDocument {
    id: string;
    document: string;
    metadata: Record<string, string | number | boolean | null>;
}

interface ChromaDBFormatResponse {
    ids: string[];
    documents: string[];
    metadatas: Record<string, string | number | boolean | null>[];
    totalChunks: number;
}

/**
 * Clean text by removing URLs and newlines
 */
const cleanText = (text: string): string => {
 if (!text) return text;

 // Remove URLs (http, https, ftp, www, etc.)
 const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|ftp:\/\/[^\s]+)/gi;
 let cleaned = text.replace(urlRegex, '');

 // Remove all types of newlines (\n, \r\n, \r) and replace with spaces
 cleaned = cleaned.replace(/\r\n/g, ' '); // Windows newlines
 cleaned = cleaned.replace(/\n/g, ' ');   // Unix newlines
 cleaned = cleaned.replace(/\r/g, ' ');   // Old Mac newlines

 // Remove multiple consecutive spaces
 cleaned = cleaned.replace(/\s+/g, ' ');

 // Trim whitespace
 cleaned = cleaned.trim();

 return cleaned;
};

/**
 * Chunk text into smaller pieces for better retrieval
 */
const chunkText = (
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
): string[] => {
    if (text.length <= chunkSize) {
        return [text];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        let chunk = text.slice(start, end);

        // Try to break at sentence boundaries for better chunks
        if (end < text.length) {
            const lastPeriod = chunk.lastIndexOf('.');
            const lastNewline = chunk.lastIndexOf('\n');
            const breakPoint = Math.max(lastPeriod, lastNewline);

            if (breakPoint > chunkSize * 0.5) {
                // Only break if we're not losing too much content
                chunk = text.slice(start, start + breakPoint + 1);
                start += breakPoint + 1;
            } else {
                start = end - overlap; // Overlap for context
            }
        } else {
            start = end;
        }

        if (chunk.trim().length > 0) {
            chunks.push(chunk.trim());
        }
    }

    return chunks;
};

/**
 * Convert extracted text to ChromaDB format
 */
const convertToChromaDBFormat = (
    text: string,
    fileName: string,
    fileType: string,
    options?: {
        chunkSize?: number;
        overlap?: number;
        additionalMetadata?: Record<string, any>;
    }
): ChromaDBFormatResponse => {
    const chunkSize = options?.chunkSize || 1000;
    const overlap = options?.overlap || 200;
    const additionalMetadata = options?.additionalMetadata || {};

    // Chunk the text if needed
    const chunks = chunkText(text, chunkSize, overlap);

    // Generate IDs and metadata for each chunk
    const ids: string[] = [];
    const documents: string[] = [];
    const metadatas: Record<string, string | number | boolean | null>[] = [];

    chunks.forEach((chunk, index) => {
        const chunkId = `file_${Date.now()}_${fileName}_chunk_${index}`;
        ids.push(chunkId);

        documents.push(chunk);

        // Create metadata compatible with ChromaDB (only primitives)
        const metadata: Record<string, string | number | boolean | null> = {
            source: 'file_upload',
            fileName: fileName,
            fileType: fileType,
            chunkIndex: index,
            totalChunks: chunks.length,
            characterCount: chunk.length,
            ...additionalMetadata,
        };

        // Sanitize additional metadata to ensure only primitives
        Object.entries(additionalMetadata).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                metadata[key] = null;
            } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                metadata[key] = value;
            } else if (Array.isArray(value)) {
                metadata[key] = value.map(String).join(', ');
            } else if (typeof value === 'object') {
                metadata[key] = JSON.stringify(value);
            } else {
                metadata[key] = String(value);
            }
        });

        metadatas.push(metadata);
    });

    return {
        ids,
        documents,
        metadatas,
        totalChunks: chunks.length,
    };
};

/**
 * Extract text from file buffer based on file type
 */
const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
    const { buffer, mimetype, originalname } = file;

    try {
        let extractedText = '';

        // Handle plain text files
        if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
            extractedText = buffer.toString('utf-8');
        }
        // Handle PDF files using pdf-parse
        else if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
            const pdfParseLib = require('pdf-parse');

            // Convert Buffer to Uint8Array (required by pdf-parse)
            const uint8Array = new Uint8Array(buffer);

            // pdf-parse version 2.4.5+ uses PDFParse class
            if (pdfParseLib.PDFParse && typeof pdfParseLib.PDFParse === 'function') {
                const PDFParse = pdfParseLib.PDFParse;
                const parser = new PDFParse(uint8Array);

                // Load the PDF document
                await parser.load();

                // Extract text using getText() method (it's async, so await it)
                const textResult = await parser.getText();

                // getText() may return an object with text property or a string directly
                const text = typeof textResult === 'string' ? textResult : (textResult?.text || textResult?.content || '');

                // Ensure text is a string
                extractedText = typeof text === 'string' ? text : String(text || '');

                if (!extractedText || extractedText.trim().length === 0) {
                    throw new Error('No text content found in PDF. The PDF may be image-based or corrupted.');
                }
            }
            // Fallback: try direct call (for older versions)
            else if (typeof pdfParseLib === 'function') {
                const data = await pdfParseLib(uint8Array);
                if (data && data.text) {
                    extractedText = typeof data.text === 'string' ? data.text : String(data.text || '');
                } else {
                    throw new Error('pdf-parse library is not properly configured or PDF parsing failed.');
                }
            } else {
                throw new Error('pdf-parse library is not properly configured or PDF parsing failed.');
            }
        }
        // Handle Word documents (.docx)
        else if (
            mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            originalname.endsWith('.docx')
        ) {
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        }
        // Try to extract as plain text for other types
        else {
            try {
                extractedText = buffer.toString('utf-8');
            } catch {
                throw new Error(`Unsupported file type: ${mimetype || originalname}. Supported types: TXT, PDF, DOCX`);
            }
        }

        // Clean text: remove URLs and newlines
        return cleanText(extractedText);
    } catch (error) {
        logger.error(`Error extracting text from file: ${(error as Error).message}`);
        throw new Error(`Failed to extract text from file: ${(error as Error).message}`);
    }
};

// Export the middleware function for standalone use
export { convertToChromaDBFormat };

export const fileUtilsService = {
    /**
     * Convert extracted text to ChromaDB format (middleware function)
     */
    convertToChromaDBFormat,

    /**
     * Extract text from uploaded file (PDF using pdf-parse, TXT, DOCX)
     */
    extractText: async (file: Express.Multer.File): Promise<ServiceResponse<ExtractTextResponse>> => {
        try {
            if (!file) {
                return new ServiceResponse<ExtractTextResponse>(
                    ResponseStatus.Failed,
                    'File is required',
                    null as any,
                    StatusCodes.BAD_REQUEST
                );
            }

            logger.info(`📄 Extracting text from file: ${file.originalname} (${file.mimetype})`);

            // Extract text from file
            const text = await extractTextFromFile(file);

            if (!text || text.trim().length === 0) {
                return new ServiceResponse<ExtractTextResponse>(
                    ResponseStatus.Failed,
                    'No text could be extracted from the file',
                    null as any,
                    StatusCodes.BAD_REQUEST
                );
            }

            const fileExtension = file.originalname.split('.').pop() || 'unknown';
            const fileType = file.mimetype || `application/${fileExtension}`;


            const response = await callAI(
                [
                    { role: 'system', content: `Make the below text clean and in readable format along with tags`+text },
                ] as any,
                false,
                'ai/gemma3'
            );
            const answer = (response as any).choices[0].message.content;

            logger.info(`✅ Successfully extracted ${answer.length} characters from ${file.originalname}`);

            return new ServiceResponse<ExtractTextResponse>(
                ResponseStatus.Success,
                `Successfully extracted text from file: ${file.originalname}`,
                {
                    text,
                    fileName: file.originalname,
                    fileType,
                    characterCount: text.length,
                },
                StatusCodes.OK
            );
        } catch (error) {
            const errorMessage = `Error extracting text from file: ${(error as Error).message}`;
            logger.error(errorMessage);
            return new ServiceResponse<ExtractTextResponse>(
                ResponseStatus.Failed,
                errorMessage,
                null as any,
                StatusCodes.INTERNAL_SERVER_ERROR
            );
        }
    },

    /**
     * Extract text and convert to ChromaDB format in one step
     */
    extractAndConvertToChromaDB: async (
        file: Express.Multer.File,
        options?: {
            chunkSize?: number;
            overlap?: number;
            additionalMetadata?: Record<string, any>;
        }
    ): Promise<ServiceResponse<ExtractTextResponse & ChromaDBFormatResponse>> => {
        try {
            if (!file) {
                return new ServiceResponse<ExtractTextResponse & ChromaDBFormatResponse>(
                    ResponseStatus.Failed,
                    'File is required',
                    null as any,
                    StatusCodes.BAD_REQUEST
                );
            }

            logger.info(`📄 Extracting and converting text from file: ${file.originalname} (${file.mimetype})`);

            // Extract text from file
            const text = await extractTextFromFile(file);

            if (!text || text.trim().length === 0) {
                return new ServiceResponse<ExtractTextResponse & ChromaDBFormatResponse>(
                    ResponseStatus.Failed,
                    'No text could be extracted from the file',
                    null as any,
                    StatusCodes.BAD_REQUEST
                );
            }

            const fileExtension = file.originalname.split('.').pop() || 'unknown';
            const fileType = file.mimetype || `application/${fileExtension}`;

            // const response = await customPrompts(
            //    `Format this text, answer based on the provided text only: ${text.slice(0, 500)}`,
            //     'ai/gemma3'
            // );
            // const answer = response || '';

            // Convert to ChromaDB format
            const chromaDBFormat = convertToChromaDBFormat(text, file.originalname, fileType, options);

            logger.info(
                `✅ Successfully extracted ${text.length} characters and converted to ${chromaDBFormat.totalChunks} chunks from ${file.originalname}`
            );

            return new ServiceResponse<ExtractTextResponse & ChromaDBFormatResponse>(
                ResponseStatus.Success,
                `Successfully extracted text and converted to ChromaDB format from file: ${file.originalname}`,
                {
                    text,
                    fileName: file.originalname,
                    fileType,
                    characterCount: text.length,
                    ...chromaDBFormat,
                },
                StatusCodes.OK
            );
        } catch (error) {
            const errorMessage = `Error extracting text and converting to ChromaDB format: ${(error as Error).message}`;
            logger.error(errorMessage);
            return new ServiceResponse<ExtractTextResponse & ChromaDBFormatResponse>(
                ResponseStatus.Failed,
                errorMessage,
                null as any,
                StatusCodes.INTERNAL_SERVER_ERROR
            );
        }
    },
};
