import PO from '../models/PO.js';
import GRN from '../models/GRN.js';
import Invoice from '../models/Invoice.js';

const sumBySku = (documents, itemField, quantityField) => {
  const totals = new Map();

  for (const document of documents) {
    for (const item of document[itemField] || []) {
      const sku = item.sku;
      const quantity = Number(item[quantityField] || 0);
      totals.set(sku, (totals.get(sku) || 0) + quantity);
    }
  }

  return totals;
};

const hasAtLeastOneMatchedInvoiceItem = (invoiceTotals, poTotals, grnTotals) => {
  for (const [sku, invoiceQuantity] of invoiceTotals.entries()) {
    const poQuantity = poTotals.get(sku) || 0;
    const grnQuantity = grnTotals.get(sku) || 0;

    if (invoiceQuantity > 0 && invoiceQuantity <= poQuantity && invoiceQuantity <= grnQuantity) {
      return true;
    }
  }

  return false;
};

export const getMatchByPoNumber = async (poNumber) => {
  const [pos, grns, invoices] = await Promise.all([
    PO.find({ poNumber }).sort({ createdAt: 1 }),
    GRN.find({ poNumber }).sort({ createdAt: 1 }),
    Invoice.find({ poNumber }).sort({ createdAt: 1 })
  ]);

  const reasons = [];

  if (pos.length > 1) {
    reasons.push('duplicate_po');
  }

  if (!pos.length || !grns.length || !invoices.length) {
    return {
      poNumber,
      status: 'insufficient_documents',
      mismatchReasons: reasons,
      po: pos[0] || null,
      grns,
      invoices,
      counts: {
        po: pos.length,
        grn: grns.length,
        invoice: invoices.length
      }
    };
  }

  const po = pos[0];
  const poTotals = sumBySku([po], 'items', 'quantity');
  const grnTotals = sumBySku(grns, 'items', 'receivedQuantity');
  const invoiceTotals = sumBySku(invoices, 'items', 'quantity');

  for (const [sku, receivedQuantity] of grnTotals.entries()) {
    if (!poTotals.has(sku)) {
      reasons.push('item_missing_in_po');
    }

    if (receivedQuantity > (poTotals.get(sku) || 0)) {
      reasons.push('grn_qty_exceeds_po_qty');
    }
  }

  for (const [sku, invoiceQuantity] of invoiceTotals.entries()) {
    if (!poTotals.has(sku)) {
      reasons.push('item_missing_in_po');
    }

    if (invoiceQuantity > (poTotals.get(sku) || 0)) {
      reasons.push('invoice_qty_exceeds_po_qty');
    }

    if (invoiceQuantity > (grnTotals.get(sku) || 0)) {
      reasons.push('invoice_qty_exceeds_grn_qty');
    }
  }

  for (const invoice of invoices) {
    if (new Date(invoice.invoiceDate) > new Date(po.poDate)) {
      reasons.push('invoice_date_after_po_date');
      break;
    }
  }

  const mismatchReasons = [...new Set(reasons)];
  let status = 'matched';

  if (mismatchReasons.length > 0) {
    status = hasAtLeastOneMatchedInvoiceItem(invoiceTotals, poTotals, grnTotals)
      ? 'partially_matched'
      : 'mismatch';
  }

  return {
    poNumber,
    status,
    mismatchReasons,
    po,
    grns,
    invoices,
    counts: {
      po: pos.length,
      grn: grns.length,
      invoice: invoices.length
    }
  };
};
