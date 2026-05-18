import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import type { DateRange } from "@/hooks/useTableFilters";

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface FacetSection {
  key: string;
  label: string;
  options: FacetOption[];
}

interface Props {
  sections: FacetSection[];
  facets: Record<string, string[]>;
  onToggle: (key: string, value: string) => void;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  dateRangeLabel?: string;
  activeCount: number;
  onClearAll: () => void;
}

export function FilterPopover({
  sections,
  facets,
  onToggle,
  dateRange,
  onDateRangeChange,
  dateRangeLabel,
  activeCount,
  onClearAll,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-medium">Filters</span>
          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearAll}
              className="h-7 gap-1 px-2 text-xs"
            >
              <X className="h-3 w-3" /> Clear all
            </Button>
          )}
        </div>
        <div className="space-y-4 p-3">
          {sections.map((sec) => (
            <div key={sec.key} className="space-y-1.5">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {sec.label}
              </div>
              <div className="space-y-1">
                {sec.options.length === 0 && (
                  <div className="text-xs text-muted-foreground">No options</div>
                )}
                {sec.options.map((opt) => {
                  const checked = (facets[sec.key] ?? []).includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center justify-between rounded px-1 py-1 hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onToggle(sec.key, opt.value)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </span>
                      {typeof opt.count === "number" && (
                        <span className="text-xs text-muted-foreground">
                          {opt.count}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {onDateRangeChange && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {dateRangeLabel ?? "Date range"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={dateRange?.from ?? ""}
                    onChange={(e) =>
                      onDateRangeChange({
                        ...(dateRange ?? {}),
                        from: e.target.value || undefined,
                      })
                    }
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={dateRange?.to ?? ""}
                    onChange={(e) =>
                      onDateRangeChange({
                        ...(dateRange ?? {}),
                        to: e.target.value || undefined,
                      })
                    }
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
