# Frontend rebuild, "Failed to fetch" fix, and load-speed work

## Add Money "Failed to fetch"

Root cause couldn't be confirmed with certainty from this sandbox (no access to the
live Vercel/Azure deployment, and outbound network here is allowlisted), but the code is
now hardened against the most likely causes instead of leaving a raw browser error on
screen:

- **`lib/api.ts`** now wraps every request in an `AbortController` timeout (15s) and
  catches `fetch()`'s own network-level failures (DNS/connection refused/CORS-rejected/
  mixed-content-blocked — all of which surface as the same unhelpful literal
  `"Failed to fetch"`) separately from HTTP error *responses*. A network failure now shows
  "Could not reach the server..." instead, and the real cause is still logged to the
  console (`[MISP] Network error calling <path>: ...`) for debugging.
- If `NEXT_PUBLIC_API_URL` is unset at build time, the app now warns loudly in the
  console rather than silently falling back to `http://localhost:8000` — the single most
  common cause of exactly this bug on a deployed build: **that env var is baked in at
  build time**, so it must be set in Vercel's project settings (not just a local `.env`)
  and the project rebuilt afterwards, or every visitor's browser tries to reach *their
  own* machine instead of the real backend.
- `AddMoneyModal` no longer collapses "the config request itself failed" and "Razorpay
  genuinely isn't configured on the server yet" into the same silent `{enabled: false}`
  state — a real connectivity problem now shows its own error message instead of looking
  identical to the normal "not set up yet" copy.

**To close this out for certain**, share the live frontend and backend URLs and this can
be tested directly (in particular, confirm `NEXT_PUBLIC_API_URL` on Vercel points at the
Azure Container App over `https://`, and that `CORS_ORIGINS` on the Azure side matches
the Vercel origin exactly, no trailing slash).

## Full frontend rebuild

Rebuilt from the single 640-line `page.tsx` (all inline `style={{...}}` objects) into:

- `tailwind.config.ts` — a real design-token system (ink/muted/paper/border/primary/navy/
  gold/danger/success) instead of ad hoc CSS variables referenced from inline styles.
- `components/ui.tsx` — shared primitives (`Card`, `Button`, `Input`, `Badge`, `Modal`).
- `components/{Login,Kyc}.tsx`, `components/layout/{Sidebar,Header,Rail}.tsx`,
  `components/views/{Overview,Offers,Conversation,Explain,Simulator}.tsx`,
  `components/modals/{AddMoneyModal,StepUpModal}.tsx`.
- `lib/{types,translations,api}.ts` — shared types/copy pulled out of the page component.

Every existing feature, endpoint, and piece of copy (including all three languages) was
preserved exactly — verified end to end with a real headless-browser run against a local
backend: login → KYC → dashboard → Add Money modal → Safety simulator → step-up
confirmation → Explainability → Conversation, at both desktop and 390px mobile widths.

This pass also found and fixed a real bug it surfaced visually: `Simulator`'s and
`AddMoneyModal`'s "refresh the dashboard after this action" callback reused the same
`load()` used for the *initial* page load, which flips a top-level `loading` flag that
swaps the *entire* dashboard tree for a full-screen spinner — unmounting whatever view
triggered it and wiping its own just-produced result (the simulator's "blocked/posted"
summary disappeared right after appearing, and every top-up/simulation caused a jarring
full-page flash). Added a separate lightweight `refresh()` that re-fetches `/dashboard`
without unmounting the current view; `load()` is now used only for the initial mount and
session-error recovery, where a full loading screen is actually correct.

## Load speed

- **Fonts**: replaced the `@import url(fonts.googleapis.com/...)` in `globals.css`
  (render-blocking, extra round trip, layout shift while it loads) with `next/font/google`
  in `layout.tsx` — the font is fetched once at build time and self-hosted from the same
  origin as the app, so a visitor's browser never talks to Google's servers at all.
- **Code-splitting**: `Offers`, `Conversation`, `Explain`, `Simulator`, and
  `AddMoneyModal` (which also pulls in the Razorpay checkout script) are now loaded via
  `next/dynamic` instead of being part of the initial bundle everyone downloads just to
  see the Overview tab they land on by default.
- **Dependency cleanup**: removed `recharts` (never imported anywhere, ~2.9k lines of
  transitive deps) and bumped `next` from `14.2.21` → `14.2.35`, the latest 14.x patch
  (fixes the security advisory `npm install` was flagging, no breaking changes).
- Production build: `First Load JS` for `/` is 101 kB (13.8 kB route-specific + 87.4 kB
  shared runtime) — everything else loads on demand per view.

None of this can fix Vercel-side cold starts or CDN routing from here (no access to that
deployment), but a smaller, self-hosted, code-split bundle is the part actually under the
app's control, and it's real, measured savings rather than a guess.

## Safety simulator step-up confirmation

Added `components/modals/StepUpModal.tsx`: before `/admin/simulate-txn` runs, it shows
the transaction's fake amount/payee/device/location and asks for a one-time code, styled
like a real payment confirmation. It is **deliberately not branded as Razorpay or any
other real provider** — nothing here is a real payment or hits a real API, so labeling it
as one would be misleading. It's a clearly-marked mock step-up check (any 4-6 digit code
is accepted, same honesty the existing KYC flow already uses for its mock DigiLocker
check), gating the simulate call the same way a real transaction would ask for
confirmation.
