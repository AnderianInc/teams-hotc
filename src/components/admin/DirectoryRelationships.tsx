import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Users } from "lucide-react";
import { toast } from "sonner";

interface Attendee {
  id: string;
  first_name: string;
  last_name: string;
}

interface Relationship {
  id: string;
  from_attendee_id: string;
  to_attendee_id: string;
  relationship_type: string;
  related_name: string;
}

interface Props {
  attendeeId: string;
  attendeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RELATIONSHIP_TYPES = ["spouse", "parent", "child", "sibling"] as const;
const INVERSE: Record<string, string> = { parent: "child", child: "parent", spouse: "spouse", sibling: "sibling" };

export default function DirectoryRelationships({ attendeeId, attendeeName, open, onOpenChange }: Props) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Attendee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [relType, setRelType] = useState<string>("spouse");

  const fetchRelationships = async () => {
    setLoading(true);
    // Get relationships where this attendee is either from or to
    const { data: fromRels } = await supabase
      .from("attendee_relationships")
      .select("id, from_attendee_id, to_attendee_id, relationship_type")
      .eq("from_attendee_id", attendeeId);

    const { data: toRels } = await supabase
      .from("attendee_relationships")
      .select("id, from_attendee_id, to_attendee_id, relationship_type")
      .eq("to_attendee_id", attendeeId);

    const allRels = [...(fromRels || []), ...(toRels || [])];
    const otherIds = allRels.map((r) =>
      r.from_attendee_id === attendeeId ? r.to_attendee_id : r.from_attendee_id
    );

    if (otherIds.length === 0) {
      setRelationships([]);
      setLoading(false);
      return;
    }

    const { data: attendees } = await supabase
      .from("attendees")
      .select("id, first_name, last_name")
      .in("id", otherIds);

    const nameMap = new Map((attendees || []).map((a) => [a.id, `${a.first_name} ${a.last_name}`]));

    setRelationships(
      allRels.map((r) => {
        const otherId = r.from_attendee_id === attendeeId ? r.to_attendee_id : r.from_attendee_id;
        const displayType = r.from_attendee_id === attendeeId ? r.relationship_type : INVERSE[r.relationship_type] || r.relationship_type;
        return {
          ...r,
          related_name: nameMap.get(otherId) || "Unknown",
          relationship_type: displayType,
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchRelationships();
  }, [open, attendeeId]);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("attendees")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
        .neq("id", attendeeId)
        .limit(10);
      setResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, attendeeId]);

  const addRelationship = async () => {
    if (!selectedId || !relType) return;
    try {
      const { error } = await supabase.from("attendee_relationships").insert({
        from_attendee_id: attendeeId,
        to_attendee_id: selectedId,
        relationship_type: relType,
      });
      if (error) throw error;
      toast.success("Relationship added");
      setAdding(false);
      setSearch("");
      setSelectedId("");
      fetchRelationships();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removeRelationship = async (id: string) => {
    const { error } = await supabase.from("attendee_relationships").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Relationship removed");
      fetchRelationships();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Relationships — {attendeeName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <p className="text-muted-foreground text-sm text-center py-4">Loading...</p>
          ) : relationships.length === 0 && !adding ? (
            <p className="text-muted-foreground text-sm text-center py-4">No relationships yet</p>
          ) : (
            <div className="space-y-2">
              {relationships.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-xs">{r.relationship_type}</Badge>
                    <span className="text-sm font-medium">{r.related_name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRelationship(r.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label>Search person</Label>
                <Input placeholder="Type a name..." value={search} onChange={(e) => setSearch(e.target.value)} />
                {results.length > 0 && (
                  <div className="max-h-32 overflow-auto rounded border mt-1">
                    {results.map((a) => (
                      <button
                        key={a.id}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent ${selectedId === a.id ? "bg-accent font-medium" : ""}`}
                        onClick={() => { setSelectedId(a.id); setSearch(`${a.first_name} ${a.last_name}`); setResults([]); }}
                      >
                        {a.first_name} {a.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Relationship</Label>
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addRelationship} disabled={!selectedId}>Add</Button>
                <Button size="sm" variant="outline" onClick={() => { setAdding(false); setSearch(""); setSelectedId(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAdding(true)}>
              <Plus className="h-3 w-3" /> Add Relationship
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
