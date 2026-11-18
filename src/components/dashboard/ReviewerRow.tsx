
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight } from "lucide-react";

// ==========================================
// REVIEWER DATA TYPE
// ==========================================

export type Reviewer = {
  id: string;
  title: string;
  subject?: string | null;
  created_by_name?: string | null;
};

// ==========================================
// COMPONENT PROPS
// ==========================================

type ReviewerRowProps = {
  reviewer: Reviewer;
};

// ==========================================
// REVIEWER ROW COMPONENT
// ==========================================

function ReviewerRow({ reviewer }: ReviewerRowProps) {
  return (
    <Link
      to={`/reviewers/${encodeURIComponent(reviewer.id)}`}
      className="row-hover flex items-center gap-3 px-5 py-3.5"
    >
      {/* Reviewer icon */}
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
        <BookOpen className="h-4 w-4" />
      </span>

      {/* Reviewer information */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-foreground">
          {reviewer.title}
        </span>

        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {reviewer.subject || "General"}

          {reviewer.created_by_name
            ? ` · ${reviewer.created_by_name}`
            : ""}
        </span>
      </span>

      {/* Navigation arrow */}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default ReviewerRow;
