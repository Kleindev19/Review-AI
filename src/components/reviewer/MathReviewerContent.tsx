
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";
import "./MathReviewerContent.css";

// ==========================================
// TYPES
// ==========================================

type MathReviewerContentProps = {
  content: string;
};

// ==========================================
// MATH FORMATTING HELPERS
// ==========================================

function toBlockMath(formula: string) {
  return `\n\n$$\n${formula.trim()}\n$$\n\n`;
}

// ==========================================
// NORMALIZE MATH FORMATS
// ==========================================

function normalizeMathContent(content: string) {
  const normalized = (content ?? "").replace(/\r\n?/g, "\n");

  // Protect fenced code blocks from math conversion.
  const chunks = normalized.split(
    /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
  );

  return chunks
    .map((chunk) => {
      if (/^(?:```|~~~)/.test(chunk)) {
        return chunk;
      }

      return chunk
        // \[ equation \] -> display math
        .replace(
          /\\\[([\s\S]*?)\\\]/g,
          (_match, formula: string) =>
            toBlockMath(formula)
        )

        // $$ equation $$ on one line -> block
        .replace(
          /^[ \t]*\$\$[ \t]*(.+?)[ \t]*\$\$[ \t]*$/gm,
          (_match, formula: string) =>
            toBlockMath(formula)
        )

        // Standalone \( equation \) -> block
        .replace(
          /^[ \t]*\\\((.*?)\\\)[ \t]*$/gm,
          (_match, formula: string) =>
            toBlockMath(formula)
        )

        // Remaining \( equation \) -> inline
        .replace(
          /\\\(([\s\S]*?)\\\)/g,
          (_match, formula: string) =>
            `$${formula.trim()}$`
        )

        // Standalone $ equation $ -> block
        .replace(
          /^[ \t]*\$([^$\n]+)\$[ \t]*$/gm,
          (_match, formula: string) =>
            toBlockMath(formula)
        );
    })
    .join("");
}

// ==========================================
// MATH REVIEWER CONTENT
// ==========================================

export default function MathReviewerContent({
  content,
}: MathReviewerContentProps) {
  const formattedContent = normalizeMathContent(
    content ?? ""
  );

  return (
    <div
      className="
        reviewer-math
        markdown-body
        min-w-0
        break-words
        text-[14px]
        leading-7
        text-foreground
      "
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkMath,
          remarkBreaks,
        ]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              throwOnError: false,
              strict: "ignore",
            },
          ],
        ]}
      >
        {formattedContent}
      </ReactMarkdown>
    </div>
  );
}
