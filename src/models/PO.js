import mongoose from 'mongoose';

const poItemSchema = new mongoose.Schema(
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

const poSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    poDate: {
      type: Date,
      required: true
    },
    vendorName: {
      type: String,
      trim: true,
      default: ''
    },
    items: {
      type: [poItemSchema],
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

const PO = mongoose.model('PO', poSchema);

export default PO;
