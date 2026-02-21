import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { syncDataToLocal, syncPendingCheckIns, getPendingCount, hasLocalData } from "@/lib/offlineSync";
import { RefreshCw, WifiOff, Wifi, CloudUpload } from "lucide-react";

export default function OfflineStatusBar() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasCached, setHasCached] = useState(false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Check cached state
    hasLocalData().then(setHasCached);
    getPendingCount().then(setPendingCount);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Auto-sync pending check-ins when coming back online
  useEffect(() => {
    if (online && pendingCount > 0) {
      syncPendingCheckIns().then((count) => {
        if (count > 0) {
          toast.success(`Synced ${count} pending check-in${count > 1 ? "s" : ""}`);
          setPendingCount((p) => p - count);
        }
      });
    }
  }, [online, pendingCount]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncDataToLocal();
      const synced = await syncPendingCheckIns();
      setHasCached(true);
      setPendingCount(await getPendingCount());
      toast.success(`Synced: ${result.children} children, ${result.families} families, ${result.rooms} rooms${synced ? `, ${synced} check-ins uploaded` : ""}`);
    } catch {
      toast.error("Sync failed — check your connection");
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={online ? "default" : "destructive"} className="gap-1">
        {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {online ? "Online" : "Offline"}
      </Badge>

      {hasCached && (
        <Badge variant="secondary" className="gap-1 text-xs">
          Cached data available
        </Badge>
      )}

      {pendingCount > 0 && (
        <Badge variant="outline" className="gap-1 text-xs">
          <CloudUpload className="h-3 w-3" />
          {pendingCount} pending
        </Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        disabled={syncing || !online}
        className="gap-1 h-7"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        Sync
      </Button>
    </div>
  );
}
