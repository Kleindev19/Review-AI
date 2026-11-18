
import ReactMarkdown from "react-markdown";

// ==========================================
// TYPES
// ==========================================

type ReviewerArticleProps = {
  content?: string | null;
};

type ReviewerSection = {
  id: string;
  title: string;
  body: string;
};

type ParsedReviewer = {
  intro: string;
  sections: ReviewerSection[];
};

// ==========================================
// CREATE URL-FRIENDLY SECTION IDS
// ==========================================

function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ==========================================
// PARSE MARKDOWN INTO SECTIONS
// ==========================================

function parseSections(
  content?: string | null
): ParsedReviewer {
  const intro: string[] = [];

  const sections: {
    title: string;
    body: string[];
  }[] = [];

  let current: {
    title: string;
    body: string[];
  } | null = null;

  String(content ?? "")
    .split("\n")
    .forEach((line) => {
      const heading = line.match(
        /^#{1,3}\s+(.+)$/
      );

      if (heading) {
        current = {
          title: heading[1]
            .replace(/\*\*/g, "")
            .trim(),
          body: [],
        };

        sections.push(current);
      } else if (current) {
        current.body.push(line);
      } else {
        intro.push(line);
      }
    });

  // Prevent duplicate heading IDs.
  const used = new Set<string>();

  return {
    intro: intro.join("\n").trim(),

    sections: sections.map(
      (section, index): ReviewerSection => {
        const baseId =
          slugify(section.title) ||
          `section-${index + 1}`;

        let id = baseId;
        let suffix = 2;

        while (used.has(id)) {
          id = `${baseId}-${suffix}`;
          suffix++;
        }

        used.add(id);

        return {
          id,
          title: section.title,
          body: section.body.join("\n").trim(),
        };
      }
    ),
  };
}

// ==========================================
// MARKDOWN CONTENT
// ==========================================

function MarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <div className="markdown-body break-words">
      <ReactMarkdown>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ==========================================
// REVIEWER ARTICLE
// ==========================================

export default function ReviewerArticle({
  content,
}: ReviewerArticleProps) {
  const { intro, sections } =
    parseSections(content);

  const hasNavigation = sections.length > 1;

  return (
    <div
      className={
        hasNavigation
          ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_180px] lg:gap-12"
          : "block"
      }
    >
      {/* ====================================
          MOBILE SECTION NAVIGATION
      ==================================== */}

      {hasNavigation && (
        <nav
          aria-label="Reviewer sections"
          className="no-scrollbar -mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="chip"
            >
              {section.title}
            </a>
          ))}
        </nav>
      )}

      {/* ====================================
          MAIN ARTICLE CONTENT
      ==================================== */}

      <article
        id="top"
        className="min-w-0"
      >
        {/* INTRODUCTION */}

        {intro && (
          <div className="mb-8">
            <MarkdownContent content={intro} />
          </div>
        )}

        {/* REVIEWER SECTIONS */}

        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className={
              index === 0
                ? "scroll-mt-24"
                : "mt-8 scroll-mt-24 border-t border-border pt-8"
            }
          >
            <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {section.title}
            </h2>

            {section.body ? (
              <MarkdownContent
                content={section.body}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Not covered in this material.
              </p>
            )}
          </section>
        ))}

        {!intro && sections.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This reviewer has no content yet.
          </p>
        )}
      </article>

      {/* ====================================
          DESKTOP TABLE OF CONTENTS
      ==================================== */}

      {hasNavigation && (
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <p className="mb-2.5 text-[11px] font-medium text-muted-foreground">
              On this page
            </p>

            <nav
              aria-label="On this page"
              className="border-l border-border"
            >
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="-ml-px block border-l-2 border-transparent py-1.5 pl-3 text-[13px] leading-snug text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      )}
    </div>
  );
}
