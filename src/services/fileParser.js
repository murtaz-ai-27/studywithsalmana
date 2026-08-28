const MAX = 35000;

async function parseTxt(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res((e.target.result || "").slice(0, MAX));
    r.onerror = () => rej(new Error("Could not read TXT file"));
    r.readAsText(file);
  });
}

async function parsePdf(file) {
  const ab = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages && text.length < MAX; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(" ") + "\n";
  }
  text = text.slice(0, MAX).trim();
  if (!text) throw new Error("PDF has no readable text. Use a text-based PDF, not scanned images.");
  return text;
}

async function parseDocx(file) {
  const ab = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  const text = (result.value || "").slice(0, MAX).trim();
  if (!text) throw new Error("Could not extract text from DOCX.");
  return text;
}

export async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "txt") return parseTxt(file);
  if (ext === "pdf") return parsePdf(file);
  if (ext === "docx") return parseDocx(file);
  throw new Error(`Unsupported: .${ext} — use PDF, TXT, or DOCX`);
}

export const fmtSize = (b) =>
  b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;
