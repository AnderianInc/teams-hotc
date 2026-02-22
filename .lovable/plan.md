

# Plan: Update QR Code URL to `teams.hotc.life/welcome`

## Change

**File:** `src/components/first-impressions/QRCodeDisplay.tsx`

Update the hardcoded `welcomeUrl` from `https://hotc.life/welcome` to `https://teams.hotc.life/welcome`. This is the only change needed -- the `/welcome` route and `register-visitor` edge function are already fully implemented and working.

## Technical Detail

- Line 7: change `const welcomeUrl = "https://hotc.life/welcome"` to `const welcomeUrl = "https://teams.hotc.life/welcome"`
- The QR code, print output, and displayed URL all derive from this single constant, so everything updates automatically.

