import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  const [email, setEmail] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!token) { setState("err"); setErr("Missing unsubscribe token."); return; }
      const { data, error } = await supabase.functions.invoke("email-unsubscribe", { body: { token } });
      if (error || data?.error) { setState("err"); setErr(error?.message || data?.error || "Failed"); return; }
      setEmail(data?.email || "");
      setState("ok");
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold mb-2">House of Transformation Church</h1>
        {state === "loading" && (
          <div className="py-6"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto my-4" />
            <h2 className="text-lg font-medium">You've been unsubscribed</h2>
            <p className="text-sm text-muted-foreground mt-2">
              {email ? <><strong>{email}</strong> will </> : "You will "}
              no longer receive emails from us. If this was a mistake, please contact us at{" "}
              <a className="underline" href="mailto:contact@hotc.life">contact@hotc.life</a>.
            </p>
          </>
        )}
        {state === "err" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto my-4" />
            <h2 className="text-lg font-medium">Couldn't unsubscribe</h2>
            <p className="text-sm text-muted-foreground mt-2">{err}</p>
          </>
        )}
      </div>
    </div>
  );
}
