const normalizeSpaces = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const toIsoDate = (value) => {
  const text = normalizeSpaces(value);

  if (!text) {
    return '';
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const dmyMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const mdyMatch = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (mdyMatch) {
    const monthLookup = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      sept: '09',
      oct: '10',
      nov: '11',
      dec: '12'
    };
    const [, monthName, day, year] = mdyMatch;
    const month = monthLookup[monthName.toLowerCase()];
    return month ? `${year}-${month}-${String(day).padStart(2, '0')}` : '';
  }

  return '';
};

const extractFirst = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeSpaces(match[1] || match[0]);
    }
  }

  return '';
};

const extractLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

const parseQuantity = (line) => {
  const match = normalizeSpaces(line).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

const isQuantityLine = (line) => /\d+(?:\.\d+)?\s*[A-Za-z]+/.test(normalizeSpaces(line));

const parseCodeToken = (value) => {
  const match = normalizeSpaces(value).match(/^([A-Za-z0-9][A-Za-z0-9-]*(?:\s+psm)?)/i);
  return match ? normalizeSpaces(match[1]) : '';
};

const normalizeItemCode = (value) =>
  normalizeSpaces(value)
    .replace(/\s+psm$/i, '')
    .trim();

const looksLikeItemCode = (line) => {
  const text = normalizeSpaces(line);
  return /^[A-Z]{2,}-[A-Z]-[A-Z]-\d{4}$/i.test(text) || /^\d{4,8}(?:\s+psm)?$/i.test(text);
};

const parseNumberedCodeLine = (line, expectedRowNumber) => {
  const text = normalizeSpaces(line).replace(/\s+/g, '');
  const rowPrefix = String(expectedRowNumber);

  if (!text.startsWith(rowPrefix)) {
    return null;
  }

  const code = text.slice(rowPrefix.length);

  return /^\d{4,8}$/.test(code)
    ? {
        rowNumber: rowPrefix,
        code
      }
    : null;
};

const parseGrnItems = (lines) => {
  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const expectedRowNumber = items.length + 1;
    const startMatch = parseNumberedCodeLine(line, expectedRowNumber);

    if (!startMatch) {
      continue;
    }

    const rowNumber = startMatch.rowNumber;
    const code = parseCodeToken(startMatch.code);
    const descriptionParts = [];
    let quantity = null;

    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j];

      if (parseNumberedCodeLine(next, Number(rowNumber) + 1)) {
        break;
      }

      if (isQuantityLine(next) && quantity === null) {
        quantity = parseQuantity(next);
        continue;
      }

      if (quantity === null && !/^\d+(?:\.\d+)?$/.test(next)) {
        descriptionParts.push(next);
      }
    }

    if (code && quantity !== null) {
      items.push({
        itemCode: code,
        sku: code,
        description: descriptionParts.join(' ').trim(),
        receivedQuantity: quantity
      });
    }
  }

  return items;
};

const parseInvoiceItems = (lines) => {
  const items = [];
  let inTable = false;
  let expectedRowNumber = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^Sr\.?/i.test(line) || /^No\.?$/i.test(line) || /^DescriptionCGST/i.test(line)) {
      inTable = true;
      continue;
    }

    if (!inTable) {
      continue;
    }

    if (/^Total Amount/i.test(line) || /^GST Compensation Cess/i.test(line) || /^Grand Total/i.test(line)) {
      break;
    }

    if (line !== String(expectedRowNumber)) {
      continue;
    }

    const quantityCandidate = [...lines.slice(Math.max(0, index - 4), index)]
      .reverse()
      .find((entry) => /^\d+(?:\.\d+)?$/.test(entry));
    const nextRowIndex = lines.findIndex((entry, entryIndex) =>
      entryIndex > index && entry === String(expectedRowNumber + 1)
    );
    const rowLines = lines.slice(index + 1, nextRowIndex === -1 ? lines.length : nextRowIndex);
    const codeCandidate = rowLines.find((entry) => /^[A-Z]{2,}-[A-Z]-[A-Z]-\d{4}$/i.test(entry));
    const descriptionCandidate = rowLines.find((entry) =>
      /[A-Za-z]/.test(entry) &&
      !/PKT$/i.test(entry) &&
      !/^Dis$/i.test(entry) &&
      !looksLikeItemCode(entry)
    );

    if (codeCandidate && quantityCandidate) {
      const code = normalizeItemCode(parseCodeToken(codeCandidate));

      items.push({
        itemCode: code,
        sku: code,
        description: descriptionCandidate || '',
        quantity: parseQuantity(quantityCandidate)
      });
    }

    expectedRowNumber += 1;
  }

  return items.filter((item) => item.sku && item.quantity !== null);
};

const parsePoItems = (lines) => {
  const items = [];
  let block = [];
  let inTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (
      /^S\.?$/i.test(line) ||
      /^Item$/i.test(line) ||
      /^Item\s*Code/i.test(line) ||
      /^Total \(INR\)$/i.test(line)
    ) {
      inTable = true;
      continue;
    }

    if (!inTable) {
      continue;
    }

    if (/^Terms And Conditions/i.test(line)) {
      break;
    }

    if (/^\d{1,2}$/.test(line) && block.length) {
      const quantityCandidate = block.find((entry) => isQuantityLine(entry));
      const codeCandidate = [...block].reverse().find((entry) => looksLikeItemCode(entry));

      if (codeCandidate && quantityCandidate) {
        items.push({
          itemCode: normalizeItemCode(parseCodeToken(codeCandidate)),
          sku: normalizeItemCode(parseCodeToken(codeCandidate)),
          description: '',
          quantity: parseQuantity(quantityCandidate)
        });
      }

      block = [line];
      continue;
    }

    block.push(line);
  }

  const codeLines = lines
    .filter((line) => /^\d{4,8}\s+psm$/i.test(line))
    .map((line) => normalizeItemCode(line));

  if (codeLines.length > items.length) {
    return codeLines.map((code) => ({
      itemCode: code,
      sku: code,
      description: '',
      quantity: 1
    }));
  }

  return items.filter((item) => item.sku && item.quantity !== null);
};

const parseTopLevel = (documentType, text) => {
  const lower = text.toLowerCase();

  if (documentType === 'po') {
    return {
      poNumber: extractFirst(text, [/PO No\s*:?\s*\n\s*([A-Z0-9-]+)/i, /\b(PO[A-Z0-9-]+)\b/i]),
      poDate: toIsoDate(extractFirst(text, [/PO Date\s*:?\s*\n\s*([^\n]+)/i, /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i, /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/])),
      vendorName: extractFirst(text, [/M\/s\s+[^\n]+/i, /Vendor Name\s*:?\s*\n\s*([^\n]+)/i]) || ''
    };
  }

  if (documentType === 'grn') {
    return {
      grnNumber: extractFirst(text, [/GRN No\s*:-?\s*\n\s*([A-Z0-9-]+)/i, /\b(GRN[A-Z0-9-]+)\b/i]),
      poNumber: extractFirst(text, [/PO No\s*:-?\s*\n\s*([A-Z0-9-]+)/i, /\b(PO[A-Z0-9-]+)\b/i]),
      grnDate: toIsoDate(extractFirst(text, [/GRN Date\s*:-?\s*\n\s*([^\n]+)/i, /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/]))
    };
  }

  if (documentType === 'invoice') {
    const invoiceNumber = extractFirst(text, [/\b(IN\d{2}[A-Z]{2}\d+)\b/i]);
    const dateAfterInvoiceNumber = invoiceNumber
      ? extractFirst(text, [new RegExp(`${invoiceNumber}\\s*\\n\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})`, 'i')])
      : '';

    return {
      invoiceNumber,
      poNumber: extractFirst(text, [/\b(CI\d*PO\d+)\b/i, /\b(PO[A-Z0-9-]+)\b/i]),
      invoiceDate: toIsoDate(
        dateAfterInvoiceNumber ||
          extractFirst(text, [/Invoice Date\.?\s*:?-?\s*\n\s*([^\n]+)/i, /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/])
      )
    };
  }

  return {};
};

export const parseDocumentFallback = (documentType, text) => {
  const lines = extractLines(text);
  const parsed = parseTopLevel(documentType, text);

  if (documentType === 'po') {
    parsed.items = parsePoItems(lines);
  } else if (documentType === 'grn') {
    parsed.items = parseGrnItems(lines);
  } else if (documentType === 'invoice') {
    parsed.items = parseInvoiceItems(lines);
  } else {
    parsed.items = [];
  }

  return parsed;
};
