import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Pencil, Eye, Save, X } from "lucide-react";

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  placeholders: string[] | null;
  updated_at: string | null;
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("name");
    if (!error) setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: editing.subject,
        body_html: editing.body_html,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id);

    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved");
      setEditing(null);
      fetchTemplates();
    }
    setSaving(false);
  };

  const getPreviewHtml = (template: EmailTemplate) => {
    let html = template.body_html;
    (template.placeholders || []).forEach((p) => {
      html = html.split(`{{${p}}}`).join(`<strong style="color:#4338ca;">[${p}]</strong>`);
    });
    return html;
  };

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">Loading templates...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-lg">Email Templates</h3>
        <Badge variant="secondary">{templates.length} templates</Badge>
      </div>

      <div className="grid gap-4">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreviewing(t)}>
                    <Eye className="h-4 w-4 mr-1" /> Preview
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...t })}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">
                <strong>Subject:</strong> {t.subject}
              </p>
              {t.placeholders && t.placeholders.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.placeholders.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs font-mono">{`{{${p}}}`}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit: {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Body HTML</Label>
                <Textarea
                  value={editing.body_html}
                  onChange={(e) => setEditing({ ...editing, body_html: e.target.value })}
                  rows={16}
                  className="font-mono text-xs"
                />
              </div>
              {editing.placeholders && editing.placeholders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Available placeholders: {editing.placeholders.map((p) => `{{${p}}}`).join(", ")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewing} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {previewing?.name}</DialogTitle>
          </DialogHeader>
          {previewing && (
            <div className="space-y-3">
              <p className="text-sm"><strong>Subject:</strong> {previewing.subject}</p>
              <div
                className="border rounded-lg p-4 bg-white"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml(previewing) }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
