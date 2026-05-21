import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, Save, Plus, Trash2, Send } from "lucide-react";

interface SmsTemplatesProps {
  onUseTemplate?: (body: string) => void;
}

interface SmsTemplate {
  id: string;
  slug: string;
  name: string;
  body: string;
  placeholders: string[] | null;
  updated_at: string | null;
}

export default function SmsTemplates({ onUseTemplate }: SmsTemplatesProps = {}) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, SmsTemplate>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_templates")
      .select("*")
      .order("name");
    if (error) toast.error(error.message);
    setTemplates((data as SmsTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<SmsTemplate>) => {
    const cur = editing[id] ?? templates.find((t) => t.id === id)!;
    setEditing({ ...editing, [id]: { ...cur, ...patch } });
  };

  const save = async (t: SmsTemplate) => {
    const updated = editing[t.id] ?? t;
    setSaving(t.id);
    const { error } = await supabase
      .from("sms_templates")
      .update({
        name: updated.name,
        body: updated.body,
        placeholders: updated.placeholders ?? [],
      })
      .eq("id", t.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setEditing((e) => {
      const n = { ...e };
      delete n[t.id];
      return n;
    });
    load();
  };

  const createNew = async () => {
    const slug = prompt("Template slug (lowercase, no spaces):");
    if (!slug) return;
    const { error } = await supabase.from("sms_templates").insert({
      slug,
      name: slug,
      body: "Hi {{first_name}}, ",
      placeholders: ["first_name", "last_name"],
    });
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (t: SmsTemplate) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    const { error } = await supabase.from("sms_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> SMS Templates
        </CardTitle>
        <Button size="sm" onClick={createNew}><Plus className="h-4 w-4 mr-1.5" /> New</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SMS templates yet.</p>
        ) : (
          templates.map((t) => {
            const cur = editing[t.id] ?? t;
            const dirty = !!editing[t.id];
            return (
              <div key={t.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={cur.name}
                      onChange={(e) => update(t.id, { name: e.target.value })}
                      className="font-medium"
                    />
                    <Badge variant="outline" className="text-[10px]">{t.slug}</Badge>
                  </div>
                  <div className="flex gap-1">
                    {onUseTemplate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onUseTemplate(cur.body);
                          toast.success("Template loaded into Text composer");
                        }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" /> Use
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={dirty ? "default" : "ghost"}
                      disabled={!dirty || saving === t.id}
                      onClick={() => save(t)}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    value={cur.body}
                    rows={4}
                    onChange={(e) => update(t.id, { body: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Placeholders: {(t.placeholders ?? []).map((p) => `{{${p}}}`).join(", ") || "—"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
