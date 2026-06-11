import mongoose from 'mongoose';

const invoiceItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    poNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    invoiceDate: {
      type: Date,
      required: true
    },
    items: {
      type: [invoiceItemSchema],
      default: []
    },
    sourceFile: {
      originalName: String,
      filename: String,
      path: String,
      mimetype: String
    },
    rawText: {
      type: String,
      select: false
    }
  },
  { timestamps: true }
);

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
