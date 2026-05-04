import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

export function usePushNotifications() {
  const { user } = useAuth();
  const [permissionState, setPermissionState] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isSupported = "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!isSupported) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission as PushPermissionState);
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported || !user) return;
    (async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    })();
  }, [isSupported, user]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || !VAPID_PUBLIC_KEY) return;
    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PushPermissionState);
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await (supabase.from as any)("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );
      setIsSubscribed(true);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await (supabase.from as any)("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user]);

  return { isSupported, permissionState, isSubscribed, isLoading, subscribe, unsubscribe };
}
