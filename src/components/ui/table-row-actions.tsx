import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type RowAction = { label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean };

export function TableRowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="icon" variant="ghost" aria-label={`Actions for ${label}`} title={`Actions for ${label}`} className="h-8 w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 data-[state=open]:opacity-100">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {actions.map((action) => <DropdownMenuItem key={action.label} disabled={action.disabled} onSelect={action.onSelect} className={action.destructive ? "text-destructive focus:text-destructive" : undefined}>{action.label}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}