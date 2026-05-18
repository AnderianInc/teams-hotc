import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { DateRange } from "@/hooks/useTableFilters";

export interface ActiveFilterTag {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  search?: string;
  onClearSearch?: () => void;
  chips?: { key: string; label: string; onRemove: () => void }[];
  facets?: ActiveFilterTag[];
  dateRange?: DateRange;
  onClearDateRange?: () => void;
  total: number;
  shown: number;
  onClearAll?: () => void;
  activeCount: number;
  className?: string;
}

export function ActiveFilterBar({
  search,
  onClearSearch,
  chips = [],
  facets = [],
  dateRange,
  onClearDateRange,
  total,
  shown,
  onClearAll,
  activeCount,
  className,
}: Props) {
  const hasDate = dateRange?.from || dateRange?.to;
  return (
    <div className={className ?? "flex flex-wrap items-center gap-2 text-xs"}>
      <span className="text-muted-foreground">
        Showing <strong className="text-foreground">{shown}</strong> of {total}
      </span>
      {search && onClearSearch && (
        <Badge variant="secondary" className="gap-1 pl-2 pr-1">
          Search: {search}
          <button onClick={onClearSearch} className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pl-2 pr-1">
          {c.label}
          <button onClick={c.onRemove} className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {facets.map((t) => (
        <Badge key={t.key} variant="secondary" className="gap-1 pl-2 pr-1">
          {t.label}
          <button onClick={t.onRemove} className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {hasDate && onClearDateRange && (
        <Badge variant="secondary" className="gap-1 pl-2 pr-1">
          {dateRange?.from ?? "…"} → {dateRange?.to ?? "…"}
          <button onClick={onClearDateRange} className="ml-1 rounded hover:bg-muted-foreground/20 p-0.5">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {activeCount > 0 && onClearAll && (
        <Button size="sm" variant="ghost" onClick={onClearAll} className="h-6 px-2 text-xs">
          Clear all
        </Button>
      )}
    </div>
  );
}
