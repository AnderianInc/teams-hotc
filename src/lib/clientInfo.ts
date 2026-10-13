// Captures where a registrant came from and what device they used.
export function parseUserAgent(ua: string) {
  const u = ua || "";
  const inApp = /FBAN|FBAV|FB_IAB/i.test(u) ? "Facebook" : /Instagram/i.test(u) ? "Instagram"
    : /TikTok|musical_ly/i.test(u) ? "TikTok" : /Snapchat/i.test(u) ? "Snapchat"
    : /Twitter/i.test(u) ? "X/Twitter" : /LinkedInApp/i.test(u) ? "LinkedIn" : "";
  const os = /iPhone|iPad|iPod/i.test(u) ? "iOS" : /Android/i.test(u) ? "Android" : /Windows/i.test(u) ? "Windows"
    : /Mac OS X|Macintosh/i.test(u) ? "macOS" : /CrOS/i.test(u) ? "ChromeOS" : /Linux/i.test(u) ? "Linux" : "";
  const browser = inApp ? `${inApp} in-app` : /Edg\//i.test(u) ? "Edge" : /SamsungBrowser/i.test(u) ? "Samsung Internet"
    : /CriOS|Chrome\//i.test(u) ? "Chrome" : /FxiOS|Firefox/i.test(u) ? "Firefox" : /Safari/i.test(u) ? "Safari" : "";
  const device = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u)) ? "Tablet"
    : /Mobi|iPhone|Android/i.test(u) ? "Mobile" : u ? "Desktop" : "";
  return { os, browser, device, in_app: inApp };
}

export function referrerSource(ref: string, utmSource?: string | null) {
  const r = (ref || "").toLowerCase();
  if (utmSource) return utmSource;
  if (!r) return "Direct";
  if (r.includes("facebook") || r.includes("fb.")) return "Facebook";
  if (r.includes("instagram")) return "Instagram";
  if (r.includes("google")) return "Google";
  if (r.includes("tiktok")) return "TikTok";
  try { return new URL(ref).hostname; } catch { return ref; }
}

export function collectClientInfo() {
  const ua = navigator.userAgent;
  const landingRef = sessionStorage.getItem("hotc_first_referrer") ?? document.referrer;
  return {
    user_agent: ua,
    ...parseUserAgent(ua),
    referrer: landingRef || "",
    landing_url: window.location.href.slice(0, 1000),
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
}
