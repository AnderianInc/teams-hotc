import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, AlertTriangle } from "lucide-react";
import RegisterChild from "./RegisterChild";
import CheckInConfirm from "./CheckInConfirm";

interface ChildResult {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade_group: string | null;
  allergies: string | null;
  family_id: string;
  families: {
    family_name: string;
    parent1_name: string;
    parent1_phone: string;
  };
}

export default function KidsCheckIn() {
  const [search, setSearch] = useState("");
  const [selectedChild, setSelectedChild] = useState<ChildResult | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const { data: children, isLoading } = useQuery({
    queryKey: ["children-search", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const term = `%${search}%`;
      const { data, error } = await supabase
        .from("children")
        .select("id, first_name, last_name, date_of_birth, grade_group, allergies, family_id, families(family_name, parent1_name, parent1_phone)")
        .or(`first_name.ilike.${term},last_name.ilike.${term},families.family_name.ilike.${term},families.parent1_phone.ilike.${term}`)
        .limit(20);
      if (error) throw error;
      return data as unknown as ChildResult[];
    },
  });

  if (selectedChild) {
    return (
      <CheckInConfirm
        child={selectedChild}
        onBack={() => setSelectedChild(null)}
      />
    );
  }

  if (showRegister) {
    return (
      <RegisterChild
        onBack={() => setShowRegister(false)}
        onRegistered={(child) => {
          setShowRegister(false);
          setSelectedChild(child);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Kids Check-In</h1>
        <p className="text-muted-foreground mt-1">Search for a child or register a new one</p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search by child name, family name, or phone..."
          className="pl-10 h-12 text-base"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {search.length >= 2 && (
        <div className="space-y-2 max-w-xl">
          {isLoading ? (
            <p className="text-muted-foreground py-4 text-center">Searching...</p>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <Card
                key={child.id}
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => setSelectedChild(child)}
              >
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div>
                    <p className="font-semibold">
                      {child.first_name} {child.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {child.grade_group || "No grade"} · {child.families?.parent1_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {child.allergies && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Allergy
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-3">No children found</p>
              <Button onClick={() => setShowRegister(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Register New Child
              </Button>
            </div>
          )}
        </div>
      )}

      {search.length < 2 && (
        <div className="max-w-xl">
          <Button variant="outline" onClick={() => setShowRegister(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Register New Child
          </Button>
        </div>
      )}
    </div>
  );
}
