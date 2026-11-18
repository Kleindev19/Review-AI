
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

function CreateStrip() {
  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      {/* Purple accent on the left */}
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-primary"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3.5">
          {/* AI icon */}
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>

          {/* Description */}
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground">
              Turn a lesson into a reviewer
            </h2>

            <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Upload a PDF, Word file or pasted notes.
              The AI builds a structured reviewer from
              that material only.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to="/create"
            className="btn btn-primary btn-sm"
          >
            Create reviewer
          </Link>

          <Link
            to="/materials"
            className="btn btn-secondary btn-sm"
          >
            Browse materials
          </Link>
        </div>
      </div>
    </section>
  );
}

export default CreateStrip;
