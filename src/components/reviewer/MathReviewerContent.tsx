import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";

// ==========================================
// TYPES
// ==========================================

type MathReviewerContentProps = {
  content: string;
};

// ==========================================
// NORMALIZE MATH FORMATS
// ==========================================

function normalizeMathContent(content: string) {
  return content
    // Convert \[ ... \] to block math
    .replace(
      /\\\[([\s\S]*?)\\\]/g,
      (_match, formula: string) =>
        `\n\n$$\n${formula.trim()}\n$$\n\n`
    )

    // Convert \( ... \) to inline math
    .replace(
      /\\\(([\s\S]*?)\\\)/g,
      (_match, formula: string) =>
        `$${formula.trim()}$`
    );
}

// ==========================================
// MATH REVIEWER CONTENT
// ==========================================

export default function MathReviewerContent({
  content,
}: MathReviewerContentProps) {
  const formattedContent =
    normalizeMathContent(content ?? "");

  return (
    <div
      className="
        markdown-body
        min-w-0
        break-words
        text-[14px]
        leading-7
        text-foreground
        [&_.katex-display]:overflow-x-auto
        [&_.katex-display]:py-3
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