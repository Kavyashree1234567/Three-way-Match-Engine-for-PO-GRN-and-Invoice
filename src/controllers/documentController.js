import PO from '../models/PO.js';
import GRN from '../models/GRN.js';
import Invoice from '../models/Invoice.js';
import extractText from '../utils/extractText.js';
import { parseDocumentWithGemini } from '../services/geminiService.js';
import { getMatchByPoNumber } from '../services/matchService.js';

const documentModels = {
  po: PO,
  grn: GRN,
  invoice: Invoice
};

const requiredFieldsByType = {
  po: ['poNumber', 'poDate'],
  grn: ['grnNumber', 'poNumber', 'grnDate'],
  invoice: ['invoiceNumber', 'poNumber', 'invoiceDate']
};

const getPoNumberFromParsedDocument = (documentType, parsedDocument) => {
  if (documentType === 'po') {
    return parsedDocument.poNumber;
  }

  return parsedDocument.poNumber;
};

const validateParsedDocument = (documentType, parsedDocument) => {
  const requiredFields = requiredFieldsByType[documentType] || [];
  const missingFields = requiredFields.filter((field) => !parsedDocument[field]);

  if (missingFields.length) {
    const error = new Error(`Parsed document is missing required fields: ${missingFields.join(', ')}`);
    error.statusCode = 422;
    throw error;
  }
};

const buildSourceFile = (file) => ({
  originalName: file.originalname,
  filename: file.filename,
  path: file.path,
  mimetype: file.mimetype
});

export const uploadDocument = async (req, res, next) => {
  try {
    const { documentType } = req.body;
    const normalizedType = documentType?.toLowerCase();
    const Model = documentModels[normalizedType];

    if (!Model) {
      return res.status(400).json({
        success: false,
        message: 'documentType must be one of: po, grn, invoice'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'file is required'
      });
    }

    const rawText = await extractText(req.file);
    const parsedDocument = await parseDocumentWithGemini(normalizedType, rawText);
    validateParsedDocument(normalizedType, parsedDocument);

    const savedDocument = await Model.create({
      ...parsedDocument,
      sourceFile: buildSourceFile(req.file),
      rawText
    });

    const poNumber = getPoNumberFromParsedDocument(normalizedType, parsedDocument);
    const match = poNumber ? await getMatchByPoNumber(poNumber) : null;

    res.status(201).json({
      success: true,
      documentType: normalizedType,
      data: savedDocument,
      match
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [po, grn, invoice] = await Promise.all([
      PO.findById(id),
      GRN.findById(id),
      Invoice.findById(id)
    ]);

    const document = po || grn || invoice;
    const documentType = po ? 'po' : grn ? 'grn' : invoice ? 'invoice' : null;

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.status(200).json({
      success: true,
      documentType,
      data: document
    });
  } catch (error) {
    next(error);
  }
};

export const getMatch = async (req, res, next) => {
  try {
    const match = await getMatchByPoNumber(req.params.poNumber);

    res.status(200).json({
      success: true,
      data: match
    });
  } catch (error) {
    next(error);
  }
};
