import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Users } from "lucide-react";

export type Channel = "sms" | "email";

export interface Recipient {
  key: string; // `${source}:${id}`
  source: "attendee" | "profile";
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  smsOptIn: boolean;
  doNotContact: boolean;
  tags: string[];
  isMember?: boolean;
  isStaff?: boolean;
  unsubscribed?: boolean;
  smsOptedOut?: boolean;
}


interface Props {
  channel: Channel;
  value: Recipient[];
  onChange: (rs: Recipient[]) => void;
  // Optional preset filters
  requireOptIn?: boolean;
}

export default function RecipientPicker({ channel, value, onChange, requireOptIn }: Props) {
  const [search, setSearch] = useState("");
  const [pool, setPool] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [smsOnly, setSmsOnly] = useState(channel === "sms" ? !!requireOptIn : false);
  const [hasContact, setHasContact] = useState(true);
  const [excludeDnc, setExcludeDnc] = useState(true);
  const [tagFilter, setTagFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [a, p, u, optOuts] = await Promise.all([
        supabase
          .from("attendees")
          .select("id, first_name, last_name, email, phone, sms_opt_in, do_not_contact, tags, is_member")
          .order("last_name", { ascending: true })
          .limit(2000),
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, sms_opt_in, do_not_contact, is_staff")
          .order("full_name", { ascending: true })
          .limit(2000),
        supabase
          .from("email_unsubscribes")
          .select("email")
          .not("unsubscribed_at", "is", null)
          .limit(5000),
        supabase.from("sms_opt_outs").select("phone_last10").limit(10000),
      ]);
      const optOutSet = new Set<string>((optOuts.data ?? []).map((r: any) => String(r.phone_last10 ?? "")));
      const last10 = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "").slice(-10);
      const unsubSet = new Set<string>((u.data ?? []).map((r: any) => String(r.email ?? "").trim().toLowerCase()));

      const aRows: Recipient[] = (a.data ?? []).map((r: any) => ({
        key: `attendee:${r.id}`,
        source: "attendee",
        id: r.id,
        firstName: r.first_name ?? "",
        lastName: r.last_name ?? "",
        email: r.email,
        phone: r.phone,
        smsOptIn: !!r.sms_opt_in,
        doNotContact: !!r.do_not_contact,
        tags: r.tags ?? [],
        isMember: !!r.is_member,
        unsubscribed: !!(r.email && unsubSet.has(String(r.email).trim().toLowerCase())),
      }));

      const pRows: Recipient[] = (p.data ?? []).map((r: any) => {
        const parts = String(r.full_name ?? "").trim().split(/\s+/);
        return {
          key: `profile:${r.id}`,
          source: "profile",
          id: r.id,
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
          email: r.email,
          phone: r.phone,
          smsOptIn: !!r.sms_opt_in,
          doNotContact: !!r.do_not_contact,
          tags: [],
          isStaff: !!r.is_staff,
          unsubscribed: !!(r.email && unsubSet.has(String(r.email).trim().toLowerCase())),
        };
      });

      // De-dupe by phone or email when both present
      const seen = new Set<string>();
      const merged: Recipient[] = [];
      for (const r of [...aRows, ...pRows]) {
        const k = (r.phone || "") + "|" + (r.email || "");
        if (k !== "|" && seen.has(k)) continue;
        if (k !== "|") seen.add(k);
        merged.push(r);
      }
      setPool(merged);
      setLoading(false);
    })();
  }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    pool.forEach((r) => r.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [pool]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((r) => {
      if (excludeDnc && r.doNotContact) return false;
      if (channel === "email" && r.unsubscribed) return false;

      if (channel === "sms") {
        if (!r.phone) return false;
        if (smsOnly && !r.smsOptIn) return false;
      } else {
        if (hasContact && !r.email) return false;
      }
      if (tagFilter && !r.tags.includes(tagFilter)) return false;
      if (!q) return true;
      const hay = `${r.firstName} ${r.lastName} ${r.email ?? ""} ${r.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pool, search, smsOnly, hasContact, excludeDnc, tagFilter, channel]);

  const selectedKeys = useMemo(() => new Set(value.map((v) => v.key)), [value]);

  const toggle = (r: Recipient) => {
    if (selectedKeys.has(r.key)) onChange(value.filter((v) => v.key !== r.key));
    else onChange([...value, r]);
  };

  const selectAllVisible = () => {
    const merged = [...value];
    const keys = new Set(value.map((v) => v.key));
    for (const r of filtered) {
      if (!keys.has(r.key)) {
        merged.push(r);
        keys.add(r.key);
      }
    }
    onChange(merged);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button size="sm" variant="outline" onClick={selectAllVisible} disabled={filtered.length === 0}>
          <Users className="h-3.5 w-3.5 mr-1.5" />
          Add all ({filtered.length})
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center text-xs">
        {channel === "sms" && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={smsOnly} onCheckedChange={(v) => setSmsOnly(!!v)} />
            SMS opt-in only
          </label>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={excludeDnc} onCheckedChange={(v) => setExcludeDnc(!!v)} />
          Exclude do-not-contact
        </label>
        {channel === "email" && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox checked={hasContact} onCheckedChange={(v) => setHasContact(!!v)} />
            Has email
          </label>
        )}
        {allTags.length > 0 && (
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      <ScrollArea className="h-48 rounded-md border">
        <ul className="divide-y">
          {loading && <li className="p-3 text-sm text-muted-foreground">Loading…</li>}
          {!loading && filtered.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No matches.</li>
          )}
          {filtered.slice(0, 300).map((r) => {
            const selected = selectedKeys.has(r.key);
            return (
              <li
                key={r.key}
                onClick={() => toggle(r)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50 ${
                  selected ? "bg-primary/5" : ""
                }`}
              >
                <Checkbox checked={selected} onCheckedChange={() => toggle(r)} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {r.firstName} {r.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {channel === "sms" ? r.phone || "no phone" : r.email || "no email"}
                    {r.tags.length > 0 && ` · ${r.tags.slice(0, 3).join(", ")}`}
                  </div>
                </div>
                {channel === "sms" && r.smsOptIn && (
                  <Badge variant="outline" className="text-[10px]">opt-in</Badge>
                )}
                {r.doNotContact && <Badge variant="destructive" className="text-[10px]">DNC</Badge>}
                {r.unsubscribed && <Badge variant="destructive" className="text-[10px]">unsubscribed</Badge>}

              </li>
            );
          })}
        </ul>
      </ScrollArea>

      {value.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Selected ({value.length})</Label>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto rounded-md border bg-muted/20 p-2">
            {value.map((r) => (
              <Badge
                key={r.key}
                variant="secondary"
                className="gap-1 cursor-pointer"
                onClick={() => onChange(value.filter((v) => v.key !== r.key))}
              >
                {r.firstName} {r.lastName}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
