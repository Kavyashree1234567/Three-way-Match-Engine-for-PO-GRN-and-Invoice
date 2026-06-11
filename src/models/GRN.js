import mongoose from 'mongoose';

const grnItemSchema = new mongoose.Schema(
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
    receivedQuantity: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const grnSchema = new mongoose.Schema(
  {
    grnNumber: {
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
    grnDate: {
      type: Date,
      required: true
    },
    items: {
      type: [grnItemSchema],
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

const GRN = mongoose.model('GRN', grnSchema);

export default GRN;
