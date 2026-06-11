import PO from '../models/PO.js';
import GRN from '../models/GRN.js';
import Invoice from '../models/Invoice.js';
import extractText from '../utils/extractText.js';
import { parseDocumentWithGemini } from '../services/geminiService.js';
import { getMatchByPoNumber } from '../services/matchService.js';
import { parseDocumentFallback } from '../utils/fallbackDocumentParser.js';

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

const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeSku = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+psm$/i, '')
    .trim();

const normalizeItem = (documentType, item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const code = normalizeSku(
    item.sku ??
      item.itemCode ??
      item.code ??
      item.productCode ??
      item.skuCode ??
      ''
  );

  if (!code) {
    return null;
  }

  const description = String(
    item.description ?? item.itemDescription ?? item.name ?? ''
  ).trim();

  const quantityField = documentType === 'grn' ? 'receivedQuantity' : 'quantity';
  const quantityValue = toNumber(
    item[quantityField] ?? item.quantity ?? item.receivedQuantity ?? item.qty ?? item.expQty ?? item.recvQty
  );

  if (quantityValue === null) {
    return null;
  }

  return {
    ...item,
    itemCode: item.itemCode ? String(item.itemCode).trim() : code,
    sku: code,
    description,
    [quantityField]: quantityValue
  };
};

const normalizeParsedDocument = (documentType, parsedDocument) => {
  const normalized = {
    ...parsedDocument
  };

  normalized.items = Array.isArray(parsedDocument.items)
    ? parsedDocument.items
        .map((item) => normalizeItem(documentType, item))
        .filter(Boolean)
    : [];

  return normalized;
};

const mergeParsedDocument = (geminiDocument = {}, fallbackDocument = {}) => {
  const merged = {
    ...fallbackDocument,
    ...geminiDocument
  };

  for (const [key, value] of Object.entries(fallbackDocument)) {
    if (
      merged[key] === undefined ||
      merged[key] === null ||
      merged[key] === '' ||
      (Array.isArray(merged[key]) && !merged[key].length)
    ) {
      merged[key] = value;
    }
  }

  return merged;
};

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
    let geminiDocument = {};

    try {
      geminiDocument = await parseDocumentWithGemini(normalizedType, rawText);
    } catch (error) {
      geminiDocument = {};
    }

    const fallbackDocument = parseDocumentFallback(normalizedType, rawText);
    const parsedDocument = mergeParsedDocument(geminiDocument, fallbackDocument);

    if (normalizedType === 'invoice' && fallbackDocument.items?.length) {
      parsedDocument.items = fallbackDocument.items;
    }

    validateParsedDocument(normalizedType, parsedDocument);
    let normalizedDocument = normalizeParsedDocument(normalizedType, parsedDocument);

    if (!normalizedDocument.items.length) {
      normalizedDocument = normalizeParsedDocument(normalizedType, fallbackDocument);
    }

    if (!normalizedDocument.items.length) {
      return res.status(422).json({
        success: false,
        message: 'No valid line items were extracted from the document'
      });
    }

    const savedDocument = await Model.create({
      ...normalizedDocument,
      sourceFile: buildSourceFile(req.file),
      rawText
    });

    const poNumber = getPoNumberFromParsedDocument(normalizedType, normalizedDocument);
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
