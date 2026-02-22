import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";

interface DirectoryEntry {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  date_of_birth: string | null;
  isVolunteer: boolean;
  tags: string[] | null;
  teamNames: string[];
}

export default function ChurchDirectory() {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDirectory = async () => {
      // Get all attendees
      const { data: attendees } = await supabase
        .from("attendees")
        .select("id, first_name, last_name, email, phone, is_member, tags, date_of_birth")
        .order("last_name");

      // Get profiles with attendee_id to know who's a volunteer
      const { data: profiles } = await supabase
        .from("profiles")
        .select("attendee_id, user_id")
        .not("attendee_id", "is", null);

      // Get team memberships with team names
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id, teams:teams(name)");

      // Map user_id -> team names
      const userTeamMap = new Map<string, string[]>();
      (teamMembers || []).forEach((tm: any) => {
        const names = userTeamMap.get(tm.user_id) || [];
        if (tm.teams?.name) names.push(tm.teams.name);
        userTeamMap.set(tm.user_id, names);
      });

      // Map attendee_id -> { isVolunteer, teamNames }
      const attendeeInfoMap = new Map<string, { isVolunteer: boolean; teamNames: string[] }>();
      (profiles || []).forEach((p) => {
        if (p.attendee_id) {
          attendeeInfoMap.set(p.attendee_id, {
            isVolunteer: true,
            teamNames: userTeamMap.get(p.user_id) || [],
          });
        }
      });

      setEntries(
        (attendees || []).map((a) => {
          const info = attendeeInfoMap.get(a.id);
          return {
            ...a,
            isVolunteer: info?.isVolunteer || false,
            teamNames: info?.teamNames || [],
          };
        })
      );
      setLoading(false);
    };
    fetchDirectory();
  }, []);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return (
      !q ||
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      (e.email?.toLowerCase().includes(q) ?? false) ||
      (e.phone?.includes(q) ?? false) ||
      e.teamNames.some((t) => t.toLowerCase().includes(q))
    );
  });

  const formatBirthday = (dob: string | null) => {
    if (!dob) return "—";
    try {
      return format(parseISO(dob), "MMM d");
    } catch {
      return "—";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Church Directory
          </CardTitle>
          <Badge variant="secondary">{entries.length} people</Badge>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading directory...</p>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Birthday</TableHead>
                  <TableHead>Team(s)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No members found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.first_name} {entry.last_name}
                      </TableCell>
                      <TableCell>{entry.email || "—"}</TableCell>
                      <TableCell>{entry.phone || "—"}</TableCell>
                      <TableCell>{formatBirthday(entry.date_of_birth)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {entry.teamNames.length > 0
                            ? entry.teamNames.map((t) => (
                                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                              ))
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {entry.is_member && <Badge variant="default">Member</Badge>}
                          {entry.isVolunteer && <Badge variant="secondary">Volunteer</Badge>}
                          {!entry.is_member && !entry.isVolunteer && (
                            <Badge variant="outline">Visitor</Badge>
                          )}
                          {entry.tags?.includes("first-timer") && (
                            <Badge variant="outline" className="text-warning border-warning">
                              First Timer
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
