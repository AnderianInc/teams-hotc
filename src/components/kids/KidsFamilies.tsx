import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import EditFamily from "./EditFamily";

export default function KidsFamilies() {
  const [search, setSearch] = useState("");
  const term = search.trim().replace(/[%,()]/g, "");

  const { data: families, isLoading } = useQuery({
    queryKey: ["kids-families", term],
    queryFn: async () => {
      let q = supabase
        .from("families")
        .select("id, family_name, parent1_name, parent1_phone, children(id, first_name)")
        .order("family_name")
        .limit(100);
      if (term.length >= 2) {
        const t = `%${term}%`;
        q = q.or(`family_name.ilike.${t},parent1_name.ilike.${t},parent1_phone.ilike.${t},parent2_name.ilike.${t}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search family, parent or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : !families?.length ? (
        <p className="text-muted-foreground text-sm">No families found.</p>
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {families.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.family_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {f.parent1_name} · {f.parent1_phone} · {(f.children || []).map((c: any) => c.first_name).join(", ") || "No children"}
                </p>
              </div>
              <EditFamily familyId={f.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
