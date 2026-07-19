import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Github, Apple, Monitor } from "lucide-react";

type Platform = "win" | "macos-arm64" | "macos-intel" | "linux";

const LABELS: Record<Platform, string> = {
  "win": "Windows",
  "macos-arm64": "macOS (Apple Silicon)",
  "macos-intel": "macOS (Intel)",
  "linux": "Linux",
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const downloadUrl = (p: Platform) =>
  `${SUPABASE_URL}/functions/v1/bridge-download?platform=${p}`;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "win";
  const ua = navigator.userAgent;
  // Apple Silicon detection is imperfect from JS; default modern Macs to arm64
  if (/Mac/i.test(ua)) {
    // Older Intel Macs run Safari with "Intel Mac OS X"; still, most 2020+ Macs are arm64
    return "macos-arm64";
  }
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "win";
}

export default function BridgeDownloadPanel() {
  const [primary, setPrimary] = useState<Platform>("win");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    setPrimary(detectPlatform());
    // Manifest may 404 until the first release is mirrored — swallow silently.
    fetch(`${SUPABASE_URL}/functions/v1/bridge-download?manifest=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => m?.tag && setVersion(m.tag))
      .catch(() => {
        /* no manifest yet — ignore */
      });
  }, []);

  const others = (Object.keys(LABELS) as Platform[]).filter((p) => p !== primary);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <Badge variant="outline">Print Bridge download</Badge>
            {version && <Badge variant="secondary">{version}</Badge>}
          </div>
          <Button asChild size="sm" variant="ghost">
            <a
              href="https://github.com/AnderianInc/teams-hotc/releases"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-3 w-3 mr-1" /> All releases
            </a>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Install this small helper on the always-on computer near the Brother QL
          printer. Once running, tablets and phones on the same wifi print
          automatically.
        </p>

        <Button asChild size="lg" className="w-full" disabled={!version}>
          <a href={downloadUrl(primary)} target="_blank" rel="noreferrer">
            {primary.startsWith("macos") ? (
              <Apple className="h-4 w-4 mr-2" />
            ) : (
              <Monitor className="h-4 w-4 mr-2" />
            )}
            Download for {LABELS[primary]}
          </a>
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {others.map((p) => (
            <Button key={p} asChild variant="outline" size="sm" disabled={!version}>
              <a href={downloadUrl(p)} target="_blank" rel="noreferrer">{LABELS[p]}</a>
            </Button>
          ))}
        </div>

        {!version && (
          <p className="text-xs text-destructive">
            No release mirrored to cloud yet. Grab binaries directly from{" "}
            <a
              className="underline"
              href="https://github.com/AnderianInc/teams-hotc/releases"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Releases
            </a>{" "}
            in the meantime.
          </p>
        )}


        <p className="text-xs text-muted-foreground">
          macOS: unzip, then right-click <code>run.command</code> → Open (one-time
          approval for unsigned apps). Full setup steps are in the guide below.
        </p>
      </CardContent>
    </Card>
  );
}
