
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

// ==========================================
// PDF-ONLY STYLES
// ==========================================

const PDF_CSS = `
  #sr-pdf-download {
    width: 674px !important;
    max-width: 674px !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
    color: #243247 !important;
    color-scheme: light !important;
    font: 14px/1.65 Arial, Helvetica, sans-serif !important;
  }

  #sr-pdf-download,
  #sr-pdf-download * {
    box-sizing: border-box !important;
    text-shadow: none !important;
  }

  /* ======================================
     DOCUMENT HEADER
  ====================================== */

  #sr-pdf-download .sr-pdf-header {
    margin: 0 0 20px !important;
    padding: 0 0 14px !important;
    border-bottom: 1px solid #dbe3eb !important;
    background: #fff !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  #sr-pdf-download .sr-pdf-brand {
    margin: 0 0 7px !important;
    color: #64748b !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: 1px !important;
  }

  #sr-pdf-download .sr-pdf-title {
    margin: 0 0 8px !important;
    color: #16283d !important;
    background: none !important;
    font-size: 25px !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
    overflow-wrap: anywhere !important;
  }

  #sr-pdf-download .sr-pdf-meta {
    margin: 0 !important;
    color: #64748b !important;
    font-size: 11px !important;
  }

  /* ======================================
     CONTENT CONTAINER
  ====================================== */

  #sr-pdf-download .sr-pdf-content,
  #sr-pdf-download .sr-pdf-content > div,
  #sr-pdf-download .sr-pdf-content .markdown-body,
  #sr-pdf-download .sr-pdf-content .reviewer-math {
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    color: #243247 !important;
    overflow: visible !important;
    font-size: 14px !important;
    line-height: 1.65 !important;
  }

  /* ======================================
     HEADINGS
  ====================================== */

  #sr-pdf-download .sr-pdf-content h1,
  #sr-pdf-download .sr-pdf-content h2,
  #sr-pdf-download .sr-pdf-content h3,
  #sr-pdf-download .sr-pdf-content h4 {
    margin: 18px 0 8px !important;
    padding: 0 !important;
    color: #16283d !important;
    background: transparent !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
    break-after: avoid !important;
    page-break-after: avoid !important;
  }

  #sr-pdf-download .sr-pdf-content h1 {
    font-size: 22px !important;
  }

  #sr-pdf-download .sr-pdf-content h2 {
    font-size: 19px !important;
  }

  #sr-pdf-download .sr-pdf-content h3 {
    font-size: 16px !important;
  }

  #sr-pdf-download .sr-pdf-content h4 {
    font-size: 14px !important;
  }

  /* ======================================
     PARAGRAPHS
  ====================================== */

  #sr-pdf-download .sr-pdf-content p {
    margin: 0 0 11px !important;
    color: #243247 !important;
    line-height: 1.65 !important;
    overflow-wrap: break-word !important;
  }

  /* ======================================
     LISTS
  ====================================== */

  #sr-pdf-download .sr-pdf-content ul,
  #sr-pdf-download .sr-pdf-content ol {
    margin: 6px 0 12px !important;
    padding-left: 25px !important;
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
    margin: 0 0 5px !important;
    padding: 0 !important;
    color: #243247 !important;
    line-height: 1.6 !important;
    overflow-wrap: anywhere !important;
  }

  #sr-pdf-download .sr-pdf-content li::marker {
    color: #334155 !important;
  }

  #sr-pdf-download .sr-pdf-content li > p {
    margin: 0 0 4px !important;
  }

  /* ======================================
     REMOVE BOLD TEXT HIGHLIGHTS
  ====================================== */

  #sr-pdf-download .sr-pdf-content strong,
  #sr-pdf-download .sr-pdf-content b {
    color: #16283d !important;
    background: transparent !important;
    background-image: none !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: 0 !important;
    font-weight: 700 !important;
  }

  /* ======================================
     REMOVE INLINE CODE HIGHLIGHTS
  ====================================== */

  #sr-pdf-download .sr-pdf-content code,
  #sr-pdf-download .sr-pdf-content code * {
    color: #243247 !important;
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    border: 0 !important;
    outline: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    font-family: "Courier New", Consolas, monospace !important;
    font-size: 12px !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  /* ======================================
     PLAIN CODE BLOCKS
  ====================================== */

  #sr-pdf-download .sr-pdf-content pre,
  #sr-pdf-download .sr-pdf-content .sr-pdf-code-block,
  #sr-pdf-download .sr-pdf-content .sr-pdf-code-chunk,
  #sr-pdf-download .sr-pdf-content .sr-pdf-code-line {
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    border: 0 !important;
    outline: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    color: #243247 !important;
  }

  #sr-pdf-download .sr-pdf-content .sr-pdf-code-block {
    display: block !important;
    margin: 9px 0 13px !important;
    padding: 0 !important;
  }

  #sr-pdf-download .sr-pdf-content .sr-pdf-code-chunk {
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  #sr-pdf-download .sr-pdf-content .sr-pdf-code-line {
    display: block !important;
    font: 12px/1.6 "Courier New", Consolas, monospace !important;
    margin: 0 !important;
    padding: 0 !important;
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
    text-align: left !important;
  }

  /* ======================================
     MATH FORMULAS
  ====================================== */

  #sr-pdf-download .sr-pdf-content .katex-display {
    display: block !important;
    max-width: 100% !important;
    margin: 12px 0 !important;
    padding: 6px 0 !important;
    overflow: visible !important;
    background: transparent !important;
    text-align: left !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  #sr-pdf-download .sr-pdf-content .katex-display > .katex {
    max-width: 100% !important;
    min-width: 0 !important;
  }

  /* ======================================
     GRAPHS AND REVIEWER IMAGES
  ====================================== */

  #sr-pdf-download .sr-pdf-content img {
    display: block !important;
    max-width: 100% !important;
    height: auto !important;
    object-fit: contain !important;
    margin: 10px auto !important;
  }

  /* ======================================
     TABLES
  ====================================== */

  #sr-pdf-download .sr-pdf-content table {
    width: 100% !important;
    max-width: 100% !important;
    margin: 10px 0 14px !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
    background: #fff !important;
  }

  #sr-pdf-download .sr-pdf-content th,
  #sr-pdf-download .sr-pdf-content td {
    padding: 7px 8px !important;
    border: 1px solid #dbe3eb !important;
    color: #243247 !important;
    background: #fff !important;
    text-align: left !important;
    vertical-align: top !important;
    font-size: 12px !important;
    overflow-wrap: anywhere !important;
  }

  #sr-pdf-download .sr-pdf-content th {
    background: #f3f6fa !important;
    font-weight: 700 !important;
  }

  /* ======================================
     BLOCKQUOTES
  ====================================== */

  #sr-pdf-download .sr-pdf-content blockquote {
    margin: 12px 0 !important;
    padding: 3px 0 3px 13px !important;
    border-left: 3px solid #cbd5e1 !important;
    color: #475569 !important;
    background: transparent !important;
  }

  /* ======================================
     DIVIDERS
  ====================================== */

  #sr-pdf-download .sr-pdf-content hr {
    margin: 16px 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-top: 1px solid #dbe3eb !important;
    background: transparent !important;
  }

  #sr-pdf-download .sr-pdf-content a {
    color: #1757a5 !important;
    text-decoration: underline !important;
  }

  /* ======================================
     ORIGINAL SOURCE IMAGES
  ====================================== */

  #sr-pdf-download .sr-pdf-section-heading {
    margin: 18px 0 12px !important;
    color: #16283d !important;
    font-size: 19px !important;
    font-weight: 700 !important;
    break-after: avoid !important;
  }

  #sr-pdf-download .sr-pdf-figure,
  #sr-pdf-download .combined-figure {
    margin: 0 0 15px !important;
    padding: 0 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  #sr-pdf-download .sr-pdf-figure img,
  #sr-pdf-download .combined-figure img {
    display: block !important;
    max-width: 100% !important;
    max-height: 680px !important;
    width: auto !important;
    height: auto !important;
    margin: 0 auto 6px !important;
    object-fit: contain !important;
  }

  #sr-pdf-download .sr-pdf-figure figcaption,
  #sr-pdf-download .combined-figure figcaption {
    margin: 0 !important;
    color: #64748b !important;
    font-size: 11px !important;
    text-align: center !important;
  }

  /* ======================================
     COMBINED REVIEWER CHAPTERS
  ====================================== */

  #sr-pdf-download .combined-chapter-title {
    color: #16283d !important;
    font-size: 21px !important;
    margin: 0 0 8px !important;
  }

  #sr-pdf-download .combined-subject {
    color: #64748b !important;
    font-size: 11px !important;
    margin: 0 0 15px !important;
  }

  #sr-pdf-download .combined-toc {
    margin: 0 0 15px !important;
  }

  /* ======================================
     PAGE BREAKS
  ====================================== */

  #sr-pdf-download .html2pdf__page-break {
    display: block !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    break-after: page !important;
    page-break-after: always !important;
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
// BLOB TO DATA URL
// ==========================================

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(
            new Error("Could not read an image.")
          );

    reader.onerror = () =>
      reject(
        new Error("Could not read an image.")
      );

    reader.readAsDataURL(blob);
  });
}

// ==========================================
// IMAGE TO DATA URL
// ==========================================

async function imageToDataUrl(
  url: string
): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load image (HTTP ${response.status}).`
    );
  }

  return blobToDataUrl(
    await response.blob()
  );
}

// ==========================================
// SIMPLIFY CODE BLOCKS
// ==========================================
// Convert <pre> blocks into plain text lines.
// This removes colored rectangles and
// prevents a large code box from being
// sliced across PDF pages.

function simplifyCodeBlocks(
  root: HTMLElement
): void {
  const blocks = Array.from(
    root.querySelectorAll("pre")
  );

  for (const pre of blocks) {
    const raw = (pre.textContent ?? "")
      .replace(/\r\n?/g, "\n");

    const lines = raw
      .replace(/^\n/, "")
      .replace(/\n$/, "")
      .split("\n");

    const wrapper = el(
      "div",
      "sr-pdf-code-block"
    );

    // Maximum of six source lines per chunk.
    // Small chunks are easier to paginate.

    for (
      let start = 0;
      start < lines.length;
      start += 6
    ) {
      const chunk = el(
        "div",
        "sr-pdf-code-chunk"
      );

      for (
        const line of lines.slice(
          start,
          start + 6
        )
      ) {
        chunk.appendChild(
          el(
            "div",
            "sr-pdf-code-line",
            line || "\u00a0"
          )
        );
      }

      wrapper.appendChild(chunk);
    }

    pre.replaceWith(wrapper);
  }
}

// ==========================================
// WAIT FOR PDF IMAGES
// ==========================================

async function waitForImages(
  root: HTMLElement
): Promise<void> {
  await Promise.all(
    Array.from(
      root.querySelectorAll("img")
    ).map(async (image) => {
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
}

// ==========================================
// FIT LONG MATH EQUATIONS
// ==========================================

function fitWideMath(
  root: HTMLElement
): void {
  const displays =
    root.querySelectorAll<HTMLElement>(
      ".katex-display"
    );

  for (const display of displays) {
    const math =
      display.querySelector<HTMLElement>(
        ":scope > .katex"
      );

    if (!math) continue;

    const available = Math.max(
      200,
      display.clientWidth - 8
    );

    const actual = math.scrollWidth;

    if (actual > available) {
      const ratio = Math.max(
        0.55,
        Math.min(1, available / actual)
      );

      math.style.setProperty(
        "font-size",
        `${ratio}em`,
        "important"
      );
    }
  }
}

// ==========================================
// KEEP SMALL BLOCKS TOGETHER
// ==========================================

function markShortBlocks(
  root: HTMLElement
): void {
  const blocks =
    root.querySelectorAll<HTMLElement>(
      "table, .katex-display, blockquote"
    );

  for (const block of blocks) {
    if (
      block.getBoundingClientRect().height < 480
    ) {
      block.classList.add(
        "sr-pdf-keep-together"
      );
    }
  }
}

// ==========================================
// MAIN PDF EXPORT
// ==========================================

export async function printReviewerPdf({
  title,
  subject,
  updatedAt,
  contentElement,
  visuals = [],
}: ReviewerPdfOptions): Promise<void> {
  const staging =
    document.createElement("div");

  staging.style.cssText =
    "position:fixed;left:-30000px;top:0;width:674px;" +
    "background:#fff;pointer-events:none;z-index:-1;";

  const root = el(
    "main",
    "sr-pdf-document"
  );

  root.id = "sr-pdf-download";

  const style =
    document.createElement("style");

  style.textContent = PDF_CSS;

  try {
    document.head.appendChild(style);
    document.body.appendChild(staging);
    staging.appendChild(root);

    // ======================================
    // PDF HEADER
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
      date &&
      !Number.isNaN(date.getTime())
        ? date.toLocaleDateString(
            "en-PH",
            {
              month: "long",
              day: "numeric",
              year: "numeric",
            }
          )
        : "";

    const meta = [
      `Subject: ${
        subject?.trim() || "General"
      }`,
      dateText
        ? `Updated: ${dateText}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    header.appendChild(
      el(
        "p",
        "sr-pdf-meta",
        meta
      )
    );

    root.appendChild(header);

    // ======================================
    // OPTIONAL ORIGINAL SOURCE IMAGES
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

        const image = el(
          "img",
          ""
        );

        image.src =
          await imageToDataUrl(
            visual.url
          );

        image.alt =
          `Original image from page ${visual.pageNumber}`;

        figure.append(
          image,
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
    // CLONE REVIEWER CONTENT
    // ======================================

    const section = el(
      "section",
      "sr-pdf-content"
    );

    const cloned =
      contentElement.cloneNode(
        true
      ) as HTMLElement;

    cloned.removeAttribute("id");

    section.appendChild(cloned);
    root.appendChild(section);

    // ======================================
    // FIX CODE BLOCK FORMATTING
    // ======================================

    simplifyCodeBlocks(section);

    // ======================================
    // PREPARE MATH AND IMAGES
    // ======================================

    await document.fonts.ready;
    await waitForImages(root);

    fitWideMath(root);
    markShortBlocks(root);

    // ======================================
    // PDF SETTINGS
    // ======================================

    const mobile =
      window.matchMedia(
        "(max-width: 768px)"
      ).matches;

    const options = {
      margin: [
        16,
        16,
        17,
        16,
      ] as [
        number,
        number,
        number,
        number,
      ],

      filename:
        filenameFromTitle(title),

      image: {
        type: "jpeg" as const,
        quality: 0.96,
      },

      html2canvas: {
        scale: mobile ? 1.4 : 1.8,
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
        mode: [
          "css",
          "legacy",
        ],

        avoid: [
          ".sr-pdf-header",
          ".sr-pdf-figure",
          ".combined-figure",
          ".sr-pdf-code-chunk",
          ".sr-pdf-keep-together",
          "h1",
          "h2",
          "h3",
        ],
      },
    };

    // ======================================
    // GENERATE AND DOWNLOAD
    // ======================================

    await html2pdf()
      .set(options)
      .from(root)
      .save();

  } finally {
    staging.remove();
    style.remove();
  }
}
