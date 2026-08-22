# Demo-readiness — verdict for header-cleanup-and-geoguard-ia4u9p

**Two user-reported bugs closed:**

1. **Geoguard blocks EVERY user with "browser not allowed"** — root cause was `public/_headers` shipping `Permissions-Policy: geolocation=()` from the first commit (before the geofence feature existed). Chromium/Safari refused to even prompt. One-character fix (`geolocation=(self)`) unblocks the entire feature. This is the single most impactful line in the diff.

2. **Mobile header stacked 5 rows deep with a duplicate add-store affordance** — screenshot from user showed the ugly result. Removed Nav's `+ Cửa hàng khác` (dup of StoreSwitcher's button), split header into two clean rows, shortened the StoreSwitcher label from 32 chars to 15 chars with full copy preserved as a tooltip.

**Manager flow after this PR — traced end-to-end:**
Settings → Store location → "Use my current location" → browser NOW prompts for permission (previously silently rejected) → tap Allow → lat/lng populate → Save → toggle Require → back to Clock page → Clock In from within radius succeeds, from outside fails with a Vietnamese message showing the actual distance.

**Employee flow:**
Clock page shows the correct not-configured message with a "ask your manager" hint (no dead-end link for non-managers). Once configured, geofence enforcement fires server-side and surfaces a Vietnamese distance-based error.

**Non-blockers noted but not fixed here:**
- Denied-hint copy assumes desktop Chrome menu labels; mobile Chrome/Safari path differs (through the address-bar lock icon). Understandable enough not to fail a demo, but polish later.
- Dead-code `storeId &&` guard in Layout (Layout only mounts under `/store/:storeId`).

**Production readiness for a Mau Heritage store today:** YES for the geoguard flow specifically — this PR is what makes the anti-cheat feature actually usable in practice. The header fix removes a visible embarrassment. Everything from prior PRs (auth, invites, RLS lockdown, audit triggers, notification producers, variance/dedupe/pagination hardening) already sits behind this in `main`.

Sign-off: PASS. Recommend merge after preview verification.
