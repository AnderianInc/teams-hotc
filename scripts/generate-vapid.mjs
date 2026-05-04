#!/usr/bin/env node
/**
 * Usage: node scripts/generate-vapid.mjs [your-email]
 * Example: node scripts/generate-vapid.mjs admin@hotc.org
 *
 * Generates all VAPID env vars needed for push notifications.
 * Requires: npm install web-push  (or: npx --yes web-push)
 */

import { execSync } from "node:child_process";

const email = process.argv[2] || "admin@hotc.org";

// Step 1: generate raw VAPID keys via web-push
let rawOutput;
try {
  rawOutput = execSync("npx --yes web-push generate-vapid-keys --json", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch {
  // fallback: non-JSON output
  rawOutput = execSync("npx --yes web-push generate-vapid-keys", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// Parse public/private key strings
let publicKeyB64, privateKeyB64;
if (rawOutput.trim().startsWith("{")) {
  const parsed = JSON.parse(rawOutput);
  publicKeyB64 = parsed.publicKey;
  privateKeyB64 = parsed.privateKey;
} else {
  const pubMatch = rawOutput.match(/Public Key:\s*\n?\s*([A-Za-z0-9\-_]+)/);
  const privMatch = rawOutput.match(/Private Key:\s*\n?\s*([A-Za-z0-9\-_]+)/);
  if (!pubMatch || !privMatch) {
    console.error("Could not parse web-push output:\n", rawOutput);
    process.exit(1);
  }
  publicKeyB64 = pubMatch[1].trim();
  privateKeyB64 = privMatch[1].trim();
}

// Step 2: decode the public key to extract X and Y coordinates
// The public key is an uncompressed EC point: 0x04 || x (32 bytes) || y (32 bytes)
function base64UrlDecode(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function base64UrlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

const pubKeyBytes = base64UrlDecode(publicKeyB64);
if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
  console.error("Unexpected public key format (expected 65-byte uncompressed EC point).");
  process.exit(1);
}

const x = base64UrlEncode(pubKeyBytes.slice(1, 33));
const y = base64UrlEncode(pubKeyBytes.slice(33, 65));

// Step 3: build the JWK
const privateKeyJwk = JSON.stringify({
  kty: "EC",
  crv: "P-256",
  d: privateKeyB64,
  x,
  y,
});

// Step 4: print all the env vars
console.log("\n=== VAPID Keys Generated ===\n");

console.log("# ── .env (client side) ──────────────────────────────");
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKeyB64}\n`);

console.log("# ── Supabase Edge Function secrets ──────────────────");
console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`);
console.log(`VAPID_SUBJECT=mailto:${email}`);
console.log(`VAPID_PRIVATE_KEY_JWK=${privateKeyJwk}\n`);

console.log("# ── How to set Supabase secrets ─────────────────────");
console.log(`supabase secrets set VAPID_PUBLIC_KEY="${publicKeyB64}"`);
console.log(`supabase secrets set VAPID_SUBJECT="mailto:${email}"`);
console.log(`supabase secrets set VAPID_PRIVATE_KEY_JWK='${privateKeyJwk}'`);
console.log("\n⚠  Never commit these values to git.");
