
import html2pdf from "html2pdf.js";
export type ReviewerPdfVisual = {
  pageNumber: number;
  url: string;
};

type ReviewerPdfOptions = {
  title: string;
  subject?: string | null;
  updatedAt?: string | null;
  contentElement: HTMLElement;
  visuals?: ReviewerPdfVisual[];
};

const PDF_CSS = `
  #sr-pdf-download {
    width: 674px !important;
    max-width: none !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #ffffff !important;
    color: #1e293b !important;
    color-scheme: light !important;
    font: 15px/1.65 Arial, Helvetica, sans-serif !important;
  }

  #sr-pdf-download,
  #sr-pdf-download * {
    box-sizing: border-box;
  }

  #sr-pdf-download * {
    color: #1e293b !important;
    text-shadow: none !important;
  }

  /* PDF HEADER */

  #sr-pdf-download .sr-pdf-header {
    border-bottom: 1px solid #d9e1eb;
    padding: 0 0 16px;
    margin: 0 0 22px;
    break-inside: avoid;
  }

  #sr-pdf-download .sr-pdf-brand {
    margin: 0 0 8px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 1.1px;
    color: #64748b !important;
  }

  #sr-pdf-download .sr-pdf-title {
    margin: 0 0 8px !important;
    font-size: 27px !important;
    line-height: 1.25 !important;
    font-weight: 700 !important;
    color: #14243d !important;
    overflow-wrap: anywhere;
  }

  #sr-pdf-download .sr-pdf-meta {
    margin: 0 !important;
    font-size: 12px !important;
    color: #64748b !important;
  }

  /* DIAGRAMS */

  #sr-pdf-download .sr-pdf-section-heading {
    margin: 18px 0 12px !important;
    font-size: 19px !important;
    font-weight: 700 !important;
    color: #14243d !important;
    break-after: avoid;
  }

  #sr-pdf-download .sr-pdf-figure {
    margin: 0 0 18px !important;
    padding: 0 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  #sr-pdf-download .sr-pdf-figure img {
    width: auto !important;
    height: auto !important;
    max-width: 100% !important;
    max-height: 700px !important;
    margin: 0 auto 6px !important;
    display: block !important;
    object-fit: contain !important;
  }

  #sr-pdf-download .sr-pdf-figure figcaption {
    margin: 0 !important;
    text-align: center;
    font-size: 12px !important;
    color: #64748b !important;
  }

  /* REVIEWER CONTAINER */

  #sr-pdf-download .sr-pdf-content,
  #sr-pdf-download .sr-pdf-content > div,
  #sr-pdf-download .sr-pdf-content .markdown-body {
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: transparent !important;
    border: 0 !important;
    box-shadow: none !important;
  }

  /* HEADINGS */

  #sr-pdf-download .sr-pdf-content h1,
  #sr-pdf-download .sr-pdf-content h2,
  #sr-pdf-download .sr-pdf-content h3,
  #sr-pdf-download .sr-pdf-content h4 {
    margin: 18px 0 9px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
    color: #14243d !important;
    break-after: avoid !important;
    page-break-after: avoid !important;
  }

  #sr-pdf-download .sr-pdf-content h1 {
    font-size: 23px !important;
  }

  #sr-pdf-download .sr-pdf-content h2 {
    font-size: 19px !important;
  }

  #sr-pdf-download .sr-pdf-content h3 {
    font-size: 17px !important;
  }

  #sr-pdf-download .sr-pdf-content h4 {
    font-size: 16px !important;
  }

  /* PARAGRAPHS AND SPACING */

  #sr-pdf-download .sr-pdf-content p {
    margin: 0 0 11px !important;
    line-height: 1.65 !important;
    orphans: 3;
    widows: 3;
  }

  /* BULLET POINTS */

  #sr-pdf-download .sr-pdf-content ul,
  #sr-pdf-download .sr-pdf-content ol {
    margin: 5px 0 13px !important;
    padding-left: 26px !important;
    list-style-position: outside !important;
  }

  #sr-pdf-download .sr-pdf-content ul {
    list-style-type: disc !important;
  }

  #sr-pdf-download .sr-pdf-content ol {
    list-style-type: decimal !important;
  }

  #sr-pdf-download .sr-pdf-content li {
    display: list-item !important;
    margin: 0 0 6px !important;
    padding: 0 !important;
    line-height: 1.6 !important;
  }

  #sr-pdf-download .sr-pdf-content strong,
  #sr-pdf-download .sr-pdf-content b {
    font-weight: 700 !important;
  }

  /* KATEX FORMULAS */

  #sr-pdf-download .sr-pdf-content .katex {
    font-size: 1em !important;
  }

  #sr-pdf-download .sr-pdf-content .katex-display {
    display: block !important;
    margin: 14px 0 !important;
    padding: 4px 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
    break-inside: avoid !important;
  }

  /* CONTENT IMAGES */

  #sr-pdf-download .sr-pdf-content img {
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
  }

  /* TABLES */

  #sr-pdf-download .sr-pdf-content table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin: 12px 0 !important;
  }

  #sr-pdf-download .sr-pdf-content th,
  #sr-pdf-download .sr-pdf-content td {
    border: 1px solid #d9e1eb !important;
    padding: 9px !important;
    text-align: left;
  }

  #sr-pdf-download .sr-pdf-content pre {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
  }

  #sr-pdf-download .sr-pdf-content blockquote {
    border-left: 3px solid #cbd5e1 !important;
    padding-left: 13px !important;
    margin: 12px 0 !important;
  }

  #sr-pdf-download .sr-pdf-content hr {
    border: 0 !important;
    border-top: 1px solid #d9e1eb !important;
    margin: 16px 0 !important;
  }
`;

// ==========================================
// SAFE PDF FILENAME
// ==========================================

function filenameFromTitle(title: string): string {
  const safe = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 70);

  return `${safe || "StudyRoom-Reviewer"}.pdf`;
}

// ==========================================
// CONVERT SAVED DIAGRAM TO DATA URL
// ==========================================

async function imageToDataUrl(
  url: string
): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load diagram (HTTP ${response.status}).`
    );
  }

  const blob = await response.blob();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          new Error("Could not read diagram.")
        );
      }
    };

    reader.onerror = () => {
      reject(
        new Error("Could not read diagram.")
      );
    };

    reader.readAsDataURL(blob);
  });
}

// ==========================================
// HTML ELEMENT HELPER
// ==========================================

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  element.className = className;

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

// ==========================================
// DIRECT PDF EXPORT
// ==========================================

export async function printReviewerPdf({
  title,
  subject,
  updatedAt,
  contentElement,
  visuals = [],
}: ReviewerPdfOptions): Promise<void> {
  // Off-screen staging area.
  // Only the host is off-screen, not the PDF content.

  const staging = document.createElement("div");

  staging.style.cssText =
    "position:fixed;left:-20000px;top:0;width:674px;" +
    "background:#fff;pointer-events:none;";

  const root = el("main", "sr-pdf-document");

  root.id = "sr-pdf-download";

  const style = document.createElement("style");

  style.textContent = PDF_CSS;

  try {
    document.head.appendChild(style);
    document.body.appendChild(staging);
    staging.appendChild(root);

    // ======================================
    // HEADER
    // ======================================

    const header = el(
      "header",
      "sr-pdf-header"
    );

    header.append(
      el(
        "p",
        "sr-pdf-brand",
        "STUDYROOM REVIEWER"
      ),
      el(
        "h1",
        "sr-pdf-title",
        title
      )
    );

    const date = updatedAt
      ? new Date(updatedAt)
      : null;

    const dateText =
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en-PH", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "";

    const meta = [
      `Subject: ${subject?.trim() || "General"}`,
      dateText
        ? `Updated: ${dateText}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    header.appendChild(
      el("p", "sr-pdf-meta", meta)
    );

    root.appendChild(header);

    // ======================================
    // ORIGINAL SAVED DIAGRAMS
    // ======================================

    if (visuals.length > 0) {
      const section = el(
        "section",
        "sr-pdf-visuals"
      );

      section.appendChild(
        el(
          "h2",
          "sr-pdf-section-heading",
          "Original Diagrams & Figures"
        )
      );

      for (const visual of visuals) {
        const figure = el(
          "figure",
          "sr-pdf-figure"
        );

        const img = el("img", "");

        // Embed image directly for PDF rendering.
        img.src = await imageToDataUrl(
          visual.url
        );

        img.alt =
          `Diagram from page ${visual.pageNumber}`;

        figure.append(
          img,
          el(
            "figcaption",
            "",
            `Figure / Page ${visual.pageNumber}`
          )
        );

        section.appendChild(figure);
      }

      root.appendChild(section);
    }

    // ======================================
    // FORMATTED REVIEWER CONTENT
    // ======================================

    const section = el(
      "section",
      "sr-pdf-content"
    );

    // Clone rendered Markdown and KaTeX.
    // Do not export the original raw text.

    const renderedReviewer =
      contentElement.cloneNode(true) as HTMLElement;

    renderedReviewer.removeAttribute("id");

    section.appendChild(
      renderedReviewer
    );

    root.appendChild(section);

    // ======================================
    // WAIT FOR KATEX FONTS AND IMAGES
    // ======================================

    await document.fonts.ready;

    const images = Array.from(
      root.querySelectorAll("img")
    );

    await Promise.all(
      images.map(async (image) => {
        if (!image.complete) {
          await new Promise<void>(
            (resolve, reject) => {
              image.addEventListener(
                "load",
                () => resolve(),
                { once: true }
              );

              image.addEventListener(
                "error",
                () =>
                  reject(
                    new Error(
                      "A PDF image could not be loaded."
                    )
                  ),
                { once: true }
              );
            }
          );
        }

        if (image.naturalWidth === 0) {
          throw new Error(
            "A PDF image could not be loaded."
          );
        }
      })
    );

    // ======================================
    // GENERATE AND DOWNLOAD PDF
    // ======================================

    // Lazy-load PDF library on export only.
    

    // Use lower canvas scale on mobile
    // to reduce memory consumption.
    const mobile = window.matchMedia(
      "(max-width: 768px)"
    ).matches;

    const options = {
      margin: [16, 16, 16, 16] as [
        number,
        number,
        number,
        number
      ],

      filename: filenameFromTitle(title),

      image: {
        type: "jpeg" as const,
        quality: 0.96,
      },

      html2canvas: {
        scale: mobile ? 1.5 : 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
      },

      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait" as const,
      },

      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [
          ".sr-pdf-header",
          ".sr-pdf-figure",
          ".katex-display",
          "h1",
          "h2",
          "h3",
        ],
      },
    };

    // No print dialog.
    // Generate PDF and trigger browser download.
    await html2pdf()
      .set(options)
      .from(root)
      .save();

  } finally {
    // Remove temporary PDF elements.
    staging.remove();
    style.remove();
  }
}
