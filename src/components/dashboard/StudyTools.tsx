
import { Link } from "react-router-dom";

import {
  ChevronRight,
  ClipboardCheck,
  FolderOpen,
  Layers,
} from "lucide-react";

const TOOLS = [
  {
    to: "/flashcards",
    icon: Layers,
    title: "Flashcards",
    description: "Flip, shuffle and mark the hard ones",
  },
  {
    to: "/quizzes",
    icon: ClipboardCheck,
    title: "Practice quiz",
    description: "Score yourself with explanations",
  },
  {
    to: "/materials",
    icon: FolderOpen,
    title: "Uploaded materials",
    description: "Files and their extracted text",
  },
];

export default function StudyTools() {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">
        Study tools
      </h2>

      <div className="divide-y divide-border border-y border-border">
        {TOOLS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 py-3"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-foreground group-hover:text-primary">
                {title}
              </span>

              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {description}
              </span>
            </span>

            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
