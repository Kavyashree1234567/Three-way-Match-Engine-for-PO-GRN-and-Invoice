# Three-Way Match Engine

Backend API for uploading Purchase Orders (PO), Goods Receipt Notes (GRN), and Invoices, extracting structured data with Gemini, storing the parsed documents in MongoDB, and running three-way matching by PO number.

## Approach

The service stores PO, GRN, and Invoice documents independently, linked by `poNumber`. Every upload is parsed with Gemini, saved in MongoDB, and then the latest match state is recalculated for that `poNumber`.

The matching key is `sku` because it is a stable item-level identifier across PO, GRN, and Invoice lines. Descriptions can vary across documents, but SKU/item code is normally consistent enough for validation.

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- Gemini API via `@google/generative-ai`
- Multer for file uploads
- `dotenv`
- `cors`

## Project Structure

```text
project-root/
|-- src/
|   |-- config/
|   |   `-- db.js
|   |-- controllers/
|   |   `-- documentController.js
|   |-- middlewares/
|   |   `-- uploadMiddleware.js
|   |-- models/
|   |   |-- PO.js
|   |   |-- GRN.js
|   |   `-- Invoice.js
|   |-- routes/
|   |   `-- documentRoutes.js
|   |-- services/
|   |   |-- geminiService.js
|   |   `-- matchService.js
|   |-- utils/
|   |   `-- extractText.js
|   `-- app.js
|-- examples/
|   |-- sample-po.json
|   |-- sample-grn.json
|   |-- sample-invoice.json
|   `-- sample-match-result.json
|-- uploads/
|-- .env
|-- postman_collection.json
|-- server.js
|-- package.json
`-- README.md
```

## Data Model

PO:

- `poNumber`
- `poDate`
- `vendorName`
- `items[]`: `sku`, `description`, `quantity`

GRN:

- `grnNumber`
- `poNumber`
- `grnDate`
- `items[]`: `sku`, `description`, `receivedQuantity`

Invoice:

- `invoiceNumber`
- `poNumber`
- `invoiceDate`
- `items[]`: `sku`, `description`, `quantity`

Each model stores upload metadata and uses Mongoose timestamps.

## Parsing Flow

1. User uploads a `.txt` or text-based `.pdf` file with `documentType`.
2. Multer saves the file in `uploads/` with a timestamped filename.
3. `extractText` reads text from TXT or PDF.
4. `geminiService` builds a document-specific prompt for PO, GRN, or Invoice.
5. Gemini returns structured JSON only.
6. The controller validates required fields and saves the parsed JSON.
7. Matching runs again for the related `poNumber`.

## Setup

Install dependencies:

```bash
npm install
```

Configure `.env`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/three-way-match-engine
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
```

Run in development:

```bash
npm run dev
```

Run in production mode:

```bash
npm start
```

## APIs

### Health Check

`GET /health`

Returns a basic service health response.

### Upload Document

`POST /documents/upload`

Content type: `multipart/form-data`

Fields:

- `file`: `.txt` or `.pdf` document
- `documentType`: `po`, `grn`, or `invoice`

Example:

```bash
curl -X POST http://localhost:5000/documents/upload \
  -F "documentType=po" \
  -F "file=@./sample-po.txt"
```

Response includes the saved document and the latest match state for its PO number.

### Get Parsed Document

`GET /documents/:id`

Returns a stored PO, GRN, or Invoice by MongoDB document ID.

### Get Match State

`GET /match/:poNumber`

Returns:

- PO data
- related GRNs
- related Invoices
- match status
- mismatch reasons
- document counts

## API Usage Examples

A Postman collection is included at:

```text
postman_collection.json
```

Import it into Postman and set:

- `baseUrl`: `http://localhost:5000`
- `documentId`: a MongoDB `_id` returned by an upload
- `poNumber`: the PO number to match, for example `PO-1001`

## Matching Logic

Matching is performed at item level using `sku`.

Rules:

- GRN received quantity must not exceed PO quantity.
- Invoice quantity must not exceed total GRN received quantity.
- Invoice quantity must not exceed PO quantity.
- Invoice date must not be after PO date.

Statuses:

- `matched`: all required documents exist and all rules pass.
- `partially_matched`: mismatches exist, but at least one invoice line is valid against PO and GRN quantities.
- `mismatch`: required documents exist but matching rules fail.
- `insufficient_documents`: at least one required document set is missing.

Mismatch reasons:

- `grn_qty_exceeds_po_qty`
- `invoice_qty_exceeds_po_qty`
- `invoice_qty_exceeds_grn_qty`
- `invoice_date_after_po_date`
- `duplicate_po`
- `item_missing_in_po`

## Out-of-Order Upload Handling

Documents are stored independently. Every upload extracts the document's `poNumber`, fetches all currently stored PO, GRN, and Invoice records for that PO number, then reruns matching.

This supports workflows where:

- invoice is uploaded before PO
- GRN is uploaded before invoice
- PO is uploaded last

Until all required document sets exist, the match status is `insufficient_documents`.

## Example Outputs

Sample parsed JSON and a sample match result are included in:

```text
examples/sample-po.json
examples/sample-grn.json
examples/sample-invoice.json
examples/sample-match-result.json
```

## Assumptions

- Uploaded documents are `.txt` or basic text-based `.pdf` files.
- Scanned PDFs require OCR before upload or an OCR layer added later.
- PO numbers connect PO, GRN, and Invoice documents.
- Duplicate PO documents are allowed so the engine can report `duplicate_po`.
- Gemini is expected to return JSON only, and the API validates required fields before saving.

## Tradeoffs

- Match results are computed on demand instead of stored as a separate match collection. This keeps the data model simple for the assignment scope.
- Duplicate POs are not rejected at upload time; they are reported as `duplicate_po` in match results.
- PDF support handles text-based PDFs only, not scanned image PDFs.

## Future Improvements

- Add OCR for scanned PDFs.
- Add authentication and role-based access control.
- Add idempotency keys or document hash checks to prevent accidental duplicate uploads.
- Add unit and integration tests.
- Add configurable quantity/date tolerance rules.
- Add audit history for match status changes.
