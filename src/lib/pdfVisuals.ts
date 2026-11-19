
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfVisualPage = {
  pageNumber: number;
  mimeType: "image/jpeg";
  dataUrl: string;
};

const MAX_PAGES = 3;
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.75;

/**
 * Converts PDF pages into images so Gemini can
 * analyze graphs, diagrams and mathematical figures.
 *
 * This is preparation only. AI integration comes later.
 */
export async function extractPdfVisuals(
  file: File
): Promise<PdfVisualPage[]> {
  if (file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please select a PDF file.");
  }

  const data = new Uint8Array(
    await file.arrayBuffer()
  );

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const pages: PdfVisualPage[] = [];

  try {
    const totalPages = Math.min(
      pdf.numPages,
      MAX_PAGES
    );

    for (let pageNumber = 1;
         pageNumber <= totalPages;
         pageNumber++) {

      const page = await pdf.getPage(pageNumber);

      try {
        const original = page.getViewport({ scale: 1 });

        const scale = Math.min(
          1.5,
          MAX_DIMENSION /
            Math.max(original.width, original.height)
        );

        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas is unavailable.");
        }

        try {
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
          }).promise;

          pages.push({
            pageNumber,
            mimeType: "image/jpeg",
            dataUrl: canvas.toDataURL(
              "image/jpeg",
              JPEG_QUALITY
            ),
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
