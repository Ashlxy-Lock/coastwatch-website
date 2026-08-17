# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Great Yarmouth real-data model

The CoastWatch model is a binary Logistic Regression trained without synthetic
coastal rows. Its reproducible data pipeline is in `scripts/` and its saved
artifacts are in `data/`.

- Location: Great Yarmouth, England (`52.60831, 1.73052`), resolved by the
  Open-Meteo Geocoding API.
- Period: hourly data from 1 January 2023 through 30 June 2026.
- Inputs: Open-Meteo historical air temperature, humidity, precipitation,
  rainfall, wind, gusts and pressure, plus historical wave height, wave period,
  sea-level height, sea-surface temperature and ocean currents.
- Labels: `unsafe` when a real Environment Agency coastal-warning issuance is
  within the documented event window (six hours before through 18 hours after
  issuance); `safe` otherwise. Historic removal times are not published, so the
  window is an explicit proxy rather than a claim that the warning remained in
  force for exactly 24 hours.
- Split: 2023–2024 for fitting, 2025 for threshold validation, and the smaller,
  untouched January–June 2026 period for test. Class weights are fitted only on
  the training years. The threshold is selected from `0.75`–`0.95` on the 2025
  validation set by unsafe-class F2 and is currently `0.76`.

Rebuild the data and model:

```bash
npm run data:build
npm run model:train
```

Use `node scripts/build-training-data.mjs --reuse-warnings` to rebuild the
Open-Meteo rows from the checked-in warning-event CSV without re-querying the
warning history pages. The normal `data:build` command refreshes those records.

Saved artifacts:

- `data/great-yarmouth-coastal-training.csv` — labelled hourly training table.
- `data/great-yarmouth-warning-events.csv` — warning issuances and provenance.
- `data/great-yarmouth-dataset-metadata.json` — query URLs, grid coordinates,
  missing-row exclusions, label policy and attribution.
- `data/great-yarmouth-logistic-model.json` — coefficients, preprocessing,
  class weights, split counts and test metrics.
- `app/trained-model.ts` — generated browser inference artifact.

Data sources: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api),
[Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api), and
the Environment Agency [Historic Flood Warnings catalogue](https://environment.data.gov.uk/dataset/88bed270-d465-11e4-8669-f0def148f590).
Open-Meteo's documented upstream marine providers, including DWD and
Copernicus/ECMWF sources, are acknowledged in the dataset metadata.
The checked-in event records were queried from FloodRadar's Great Yarmouth area
pages, which identify their source as the Environment Agency, because the
catalogue's ZIP host was not resolvable from this build environment.
