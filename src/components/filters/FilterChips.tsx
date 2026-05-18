import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function FilterChips({ options, value, onChange, className, ariaLabel }: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((opt) => {
        const active = (value || "all") === opt.value;
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => onChange(opt.value)}
            className="h-7 rounded-full px-3 text-xs"
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span className={cn("ml-1.5 opacity-70")}>· {opt.count}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
