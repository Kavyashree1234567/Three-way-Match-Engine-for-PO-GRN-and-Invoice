import fs from 'fs/promises';
import pdf from 'pdf-parse';

const extractText = async (file) => {
  if (!file) {
    throw new Error('No file provided for text extraction');
  }

  if (file.mimetype === 'text/plain') {
    return fs.readFile(file.path, 'utf8');
  }

  if (file.mimetype === 'application/pdf') {
    const buffer = await fs.readFile(file.path);
    const parsedPdf = await pdf(buffer);
    return parsedPdf.text;
  }

  throw new Error(`Unsupported file type: ${file.mimetype}`);
};

export default extractText;
