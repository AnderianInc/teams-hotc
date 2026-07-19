import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, Search, ChevronLeft, Check, Loader2, UserPlus } from "lucide-react";

type CheckInType = "volunteer" | "member" | null;
type Step = "select" | "search" | "register" | "confirming" | "done" | "already";

interface SearchResult {
  id: string;
  name: string;
  extra?: string[];
}

// Current week's Sunday (matches self-check-in edge function)
const getServiceSunday = () => {
  const now = new Date();
  const s = new Date(now);
  s.setDate(now.getDate() - now.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
};

const formatServiceDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default function CheckIn() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<CheckInType>(null);
  const [step, setStep] = useState<Step>("select");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedInName, setCheckedInName] = useState("");
  const [selfAlreadyChecked, setSelfAlreadyChecked] = useState<boolean | null>(null);
  const selfName = user?.user_metadata?.full_name || user?.email || "";
  const serviceSunday = getServiceSunday();
  const serviceDateISO = serviceSunday.toISOString().split("T")[0];
  const serviceDateLabel = formatServiceDate(serviceSunday);

  // New member registration fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Verify if the logged-in user has already checked in for this Sunday
  useEffect(() => {
    if (!user) {
      setSelfAlreadyChecked(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("weekly_attendance")
        .select("id")
        .eq("user_id", user.id)
        .eq("service_date", serviceDateISO)
        .maybeSingle();
      if (!cancelled) setSelfAlreadyChecked(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, serviceDateISO, step]);

  useEffect(() => {
    if (step === "done" || step === "already") {
      redirectTimerRef.current = setTimeout(() => {
        navigate("/dashboard");
      }, 2500);
    } else if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [step, navigate]);

  const selectType = (t: CheckInType) => {
    setType(t);
    setStep("search");
    setSearch("");
    setResults([]);
  };

  const reset = () => {
    setType(null);
    setStep("select");
    setSearch("");
    setResults([]);
    setCheckedInName("");
    setFirstName("");
    setLastName("");
    setPhone("");
  };

  // Search effect
  useEffect(() => {
    if (step !== "search" || search.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      if (type === "volunteer") {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .ilike("full_name", `%${search}%`)
          .limit(10);

        // Also fetch team info
        const userIds = (data || []).map((p) => p.user_id);
        const { data: teams } = userIds.length
          ? await supabase
              .from("team_members")
              .select("user_id, teams:teams(name)")
              .in("user_id", userIds)
          : { data: [] };

        const teamMap = new Map<string, string[]>();
        (teams || []).forEach((tm: any) => {
          const arr = teamMap.get(tm.user_id) || [];
          if (tm.teams?.name) arr.push(tm.teams.name);
          teamMap.set(tm.user_id, arr);
        });

        setResults(
          (data || []).map((p) => ({
            id: p.user_id,
            name: p.full_name,
            extra: teamMap.get(p.user_id) || [],
          }))
        );
      } else {
        const { data } = await supabase
          .from("attendees")
          .select("id, first_name, last_name")
          .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
          .limit(10);

        setResults(
          (data || []).map((a) => ({
            id: a.id,
            name: `${a.first_name} ${a.last_name}`,
          }))
        );
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, type, step]);

  const handleCheckIn = async (selectedId: string, forcedType?: CheckInType) => {
    const useType = forcedType || type;
    setStep("confirming");
    try {
      const body =
        useType === "volunteer"
          ? { type: "volunteer", user_id: selectedId }
          : { type: "member", attendee_id: selectedId };

      const { data, error } = await supabase.functions.invoke("self-check-in", {
        body,
      });

      if (error) throw error;

      setCheckedInName(data.name);
      setStep(data.status === "already_checked_in" ? "already" : "done");
    } catch {
      setStep("search");
    }
  };


  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setStep("confirming");
    try {
      const { data, error } = await supabase.functions.invoke("self-check-in", {
        body: { type: "member", first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() || undefined },
      });

      if (error) throw error;

      setCheckedInName(data.name);
      setStep(data.status === "already_checked_in" ? "already" : "done");
    } catch {
      setStep("register");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          Church Check-In
        </h1>
        <p className="text-muted-foreground text-center text-sm mb-6">Welcome! Let us know you're here today.</p>

        {/* Step: Select type */}
        {step === "select" && (
          <div className="space-y-4">
            {user && (
              <button
                onClick={() => handleCheckIn(user.id, "volunteer")}
                className="w-full rounded-xl border-2 border-primary bg-primary/5 p-6 text-left hover:bg-primary/10 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-lg text-foreground truncate">Check in as {selfName}</p>
                    <p className="text-sm text-muted-foreground">One tap — no search needed</p>
                  </div>
                </div>
              </button>
            )}

            <button
              onClick={() => selectType("volunteer")}
              className="w-full rounded-xl border-2 border-primary/20 bg-card p-6 text-left hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">Volunteer / Staff</p>
                  <p className="text-sm text-muted-foreground">I serve on a team or work here</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => selectType("member")}
              className="w-full rounded-xl border-2 border-primary/20 bg-card p-6 text-left hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">Church Member</p>
                  <p className="text-sm text-muted-foreground">I attend the church</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step: Search */}
        {step === "search" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={reset} className="mb-2">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={type === "volunteer" ? "Search your name..." : "Search your name..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-12 text-base"
                autoFocus
              />
            </div>

            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleCheckIn(r.id)}
                    className="w-full rounded-lg border bg-card p-4 text-left hover:bg-accent/50 transition-colors active:scale-[0.98]"
                  >
                    <p className="font-medium text-foreground">{r.name}</p>
                    {r.extra && r.extra.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {r.extra.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!loading && search.length >= 2 && results.length === 0 && (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm mb-3">No results found</p>
                {type === "member" && (
                  <Button variant="outline" onClick={() => setStep("register")}>
                    <UserPlus className="h-4 w-4 mr-2" /> Register as new member
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step: Register new member */}
        {step === "register" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("search")} className="mb-2">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <h2 className="font-semibold text-lg">Quick Registration</h2>
                <div>
                  <Label htmlFor="fn">First Name *</Label>
                  <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
                </div>
                <div>
                  <Label htmlFor="ln">Last Name *</Label>
                  <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ph">Phone (optional)</Label>
                  <Input id="ph" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <Button onClick={handleRegister} disabled={!firstName.trim() || !lastName.trim()} className="w-full">
                  Register & Check In
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Confirming */}
        {step === "confirming" && (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Checking you in...</p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
              <Check className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-xl font-bold mb-1">You're checked in!</h2>
            <p className="text-muted-foreground">{checkedInName}</p>
            <Button variant="outline" onClick={reset} className="mt-8">
              Check in someone else
            </Button>
          </div>
        )}

        {/* Step: Already checked in */}
        {step === "already" && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="h-20 w-20 rounded-full bg-accent flex items-center justify-center mb-4">
              <Check className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-1">Already checked in!</h2>
            <p className="text-muted-foreground">{checkedInName} is already checked in for this week.</p>
            <Button variant="outline" onClick={reset} className="mt-8">
              Check in someone else
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
