import { GoogleGenerativeAI } from '@google/generative-ai';

const schemasByDocumentType = {
  po: {
    poNumber: 'string',
    poDate: 'YYYY-MM-DD',
    vendorName: 'string',
    items: [
      {
        sku: 'string',
        description: 'string',
        quantity: 'number'
      }
    ]
  },
  grn: {
    grnNumber: 'string',
    poNumber: 'string',
    grnDate: 'YYYY-MM-DD',
    items: [
      {
        sku: 'string',
        description: 'string',
        receivedQuantity: 'number'
      }
    ]
  },
  invoice: {
    invoiceNumber: 'string',
    poNumber: 'string',
    invoiceDate: 'YYYY-MM-DD',
    items: [
      {
        sku: 'string',
        description: 'string',
        quantity: 'number'
      }
    ]
  }
};

const stripCodeFence = (value) =>
  value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const buildPrompt = (documentType, text) => {
  const schema = schemasByDocumentType[documentType];

  return `
You are an accounts payable document parser.
Extract structured data from the ${documentType.toUpperCase()} text below.
Return valid JSON only. Do not include markdown, explanation, comments, or extra keys.
Use this JSON shape exactly:
${JSON.stringify(schema, null, 2)}

Rules:
- Dates must be ISO date strings in YYYY-MM-DD format.
- Numeric quantities must be numbers.
- If a text field is missing, use an empty string.
- If items are missing, return an empty items array.

Document text:
${text}
`;
};

export const parseDocumentWithGemini = async (documentType, text) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const schema = schemasByDocumentType[documentType];

  if (!schema) {
    throw new Error(`Unsupported document type: ${documentType}`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(buildPrompt(documentType, text));
  const responseText = result.response.text();

  try {
    return JSON.parse(stripCodeFence(responseText));
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${error.message}`);
  }
};
