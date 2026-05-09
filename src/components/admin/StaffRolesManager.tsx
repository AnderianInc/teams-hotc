import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, Briefcase, Check, X } from "lucide-react";
import { toast } from "sonner";

interface StaffRole {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export default function StaffRolesManager() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["staff-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_roles" as any)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as StaffRole[];
    },
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("staff_roles" as any).insert({ name, sort_order: roles.length + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff role added");
      setNewName(""); setAdding(false);
      qc.invalidateQueries({ queryKey: ["staff-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("staff_roles" as any).update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["staff-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_roles" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["staff-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" /> Staff Roles
          </CardTitle>
          {!adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Role
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="flex items-center gap-2 mb-2">
            <Input
              autoFocus
              placeholder="e.g. Lead Pastor"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && create.mutate(newName.trim())}
            />
            <Button size="sm" onClick={() => newName.trim() && create.mutate(newName.trim())} disabled={!newName.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Loading…</p>
        ) : roles.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No staff roles yet</p>
        ) : (
          <div className="divide-y border rounded-md">
            {roles.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2">
                {editingId === r.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 mr-2 h-8"
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => update.mutate({ id: r.id, name: editName })}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">{r.name}</span>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(r.id); setEditName(r.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => confirm(`Delete "${r.name}"?`) && remove.mutate(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
