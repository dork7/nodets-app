import { StatusCodes } from 'http-status-codes';
import mammoth from 'mammoth';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { logger } from '@/server';

interface ExtractTextResponse {
 text: string;
 fileName: string;
 fileType: string;
 characterCount: number;
}

/**
 * Extract text from file buffer based on file type
 */
const extractTextFromFile = async (file: Express.Multer.File): Promise<string> => {
 const { buffer, mimetype, originalname } = file;

 try {
  // Handle plain text files
  if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
   return buffer.toString('utf-8');
  }

  // Handle PDF files using pdf-parse
  if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
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
    const textString = typeof text === 'string' ? text : String(text || '');
    
    if (!textString || textString.trim().length === 0) {
     throw new Error('No text content found in PDF. The PDF may be image-based or corrupted.');
    }

    return textString;
   }
   
   // Fallback: try direct call (for older versions)
   if (typeof pdfParseLib === 'function') {
    const data = await pdfParseLib(uint8Array);
    if (data && data.text) {
     const textString = typeof data.text === 'string' ? data.text : String(data.text || '');
     return textString;
    }
   }
   
   throw new Error('pdf-parse library is not properly configured or PDF parsing failed.');
  }

  // Handle Word documents (.docx)
  if (
   mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
   originalname.endsWith('.docx')
  ) {
   const result = await mammoth.extractRawText({ buffer });
   return result.value;
  }

  // Try to extract as plain text for other types
  try {
   return buffer.toString('utf-8');
  } catch {
   throw new Error(`Unsupported file type: ${mimetype || originalname}. Supported types: TXT, PDF, DOCX`);
  }
 } catch (error) {
  logger.error(`Error extracting text from file: ${(error as Error).message}`);
  throw new Error(`Failed to extract text from file: ${(error as Error).message}`);
 }
};

export const fileUtilsService = {
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

   logger.info(`✅ Successfully extracted ${text.length} characters from ${file.originalname}`);

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
};
