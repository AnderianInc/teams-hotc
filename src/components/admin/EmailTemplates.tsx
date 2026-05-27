import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import RichTextEditor from "@/components/comms/RichTextEditor";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Pencil, Eye, Save, X, MoreHorizontal, Send, Plus, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface EmailTemplate {
  id: string;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  placeholders: string[] | null;
  updated_at: string | null;
}

function applyPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => values[key] ?? "");
}

interface Props {
  onUseTemplate?: (subject: string, bodyHtml: string) => void;
}

export default function EmailTemplates({ onUseTemplate }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [previewing, setPreviewing] = useState<EmailTemplate | null>(null);
  const [filling, setFilling] = useState<EmailTemplate | null>(null);
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
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

  const openFillDialog = (t: EmailTemplate) => {
    const initial: Record<string, string> = {};
    (t.placeholders || []).forEach((p) => { initial[p] = ""; });
    setFillValues(initial);
    setFilling(t);
  };

  const handleUseTemplate = () => {
    if (!filling) return;
    const subject = applyPlaceholders(filling.subject, fillValues);
    const bodyHtml = applyPlaceholders(filling.body_html, fillValues);
    onUseTemplate?.(subject, bodyHtml);
    setFilling(null);
    toast.success("Template loaded into composer");
  };

  const createNew = async () => {
    const slug = prompt("Template slug (lowercase, hyphenated, e.g. 'welcome-back'):");
    if (!slug) return;
    const name = prompt("Template name (display label):", slug) || slug;
    const { error } = await supabase.from("email_templates").insert({
      slug,
      name,
      subject: "Subject — Hi {{first_name}}",
      body_html: "<p>Hi {{first_name}},</p>\n<p>Write your message here.</p>",
      placeholders: ["first_name"],
    });
    if (error) return toast.error(error.message);
    toast.success("Template created");
    fetchTemplates();
  };

  const remove = async (t: EmailTemplate) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    fetchTemplates();
  };

  if (loading) {
    return <p className="text-muted-foreground text-center py-8">Loading templates...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg">Email Templates</h3>
          <Badge variant="secondary">{templates.length} templates</Badge>
        </div>
        <Button size="sm" onClick={createNew}>
          <Plus className="h-4 w-4 mr-1.5" /> New Template
        </Button>
      </div>

      <div className="grid gap-4">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 row-actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPreviewing(t)}>
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditing({ ...t })}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    {onUseTemplate && (
                      <DropdownMenuItem onClick={() => openFillDialog(t)}>
                        <Send className="h-4 w-4 mr-2" />
                        Use Template
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => remove(t)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <Label>Body</Label>
                <RichTextEditor
                  value={editing.body_html}
                  onChange={(html) => setEditing({ ...editing, body_html: html })}
                  minHeight={320}
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

      {/* Fill Placeholders Dialog */}
      <Dialog open={!!filling} onOpenChange={(open) => !open && setFilling(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fill in: {filling?.name}</DialogTitle>
          </DialogHeader>
          {filling && (
            <div className="space-y-4">
              {(filling.placeholders || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This template has no placeholders. It will be loaded as-is.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter values for each placeholder. Leave blank to keep empty.
                  </p>
                  {(filling.placeholders || []).map((p) => (
                    <div key={p} className="space-y-1">
                      <Label className="font-mono text-xs">{`{{${p}}}`}</Label>
                      <Input
                        value={fillValues[p] ?? ""}
                        placeholder={p}
                        onChange={(e) =>
                          setFillValues((prev) => ({ ...prev, [p]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setFilling(null)}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button onClick={handleUseTemplate}>
                  <Send className="h-4 w-4 mr-1" /> Load into Composer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
