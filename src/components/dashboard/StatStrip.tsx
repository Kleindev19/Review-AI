import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export type StatItem = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  to: string;
};

type StatStripProps = {
  items: StatItem[];
};

export default function StatStrip({ items }: StatStripProps) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map(({ label, value, icon: Icon, to }) => (
        <Link
          key={label}
          to={to}
          className="group px-4 py-4 transition-colors hover:bg-secondary/40 sm:px-5"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{label}</span>
          </span>

          <span className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
              {value}
            </span>

            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
          </span>
        </Link>
      ))}
    </div>
  );
}