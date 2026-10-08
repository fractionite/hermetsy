# Hermetsy

![Hermetsy diagram](docs/hermetsy-diagram.png)

An Etsy listing assistant built around a small shop's day-to-day admin: sync listings,
prepare changes, inspect a before/after preview, and evaluate agent suggestions before approval.

This is a local proof of concept, shared under the MIT licence. The default configuration
uses synthetic shop data, rules-based evaluations, and disabled writes. No Etsy or Jev
credentials are needed to explore listing previews or run the offline evaluation dataset.

## What you can try

- Browse and edit mock listings, or preview bulk title and description changes.
- Submit agent proposals with title, description and tag changes.
- Evaluate proposals using deterministic checks and an optional Jev integration.
- Inspect stored verdicts, source evidence, proposed tags and field changes before approval.
- Explore snapshots, audit events and the rollback implementation.

The evaluation layer checks suggestion quality against the source listing. It does not
research search volume, measure keyword competition, or predict traffic or sales.
The Jev adapter is tested using mocked responses; no live-model accuracy benchmark is claimed.
The starter dataset contains six synthetic examples, not a representative Etsy benchmark.

This app is intended for local development. General web routes currently have no user
authentication, stored OAuth token fields do not implement encryption at rest, and a
write-scoped agent can acknowledge and approve proposals. Do not expose it as a hosted
service or rely on it for unattended shop updates. Verify rollback end to end before live use.

## Listing suggestion evaluations

Agent proposals now run deterministic checks (listing constraints, unresolved placeholders,
duplicate tags) before being persisted. Set `LISTING_EVAL_PROVIDER=jev` and
`TYPESAFE_API_KEY` in `.env` to additionally evaluate product relevance, supported claims,
and keyword stuffing through [TypeSafe's official API](https://docs.typesafe.ai/api).
`JEV_MODEL` defaults to `jev-1.13.0`; the returned model version is saved with each verdict.
Rules mode is the default and needs no model credentials.

Source listing evidence is retained in operation settings. Evaluations are stored in
operation settings and proposal audit metadata, with rubric
version, thresholds, timestamp, probabilities and elapsed time. The operation preview
shows the verdict and proposed tags. Both approval endpoints require
`{"evaluationAcknowledged":true}` for agent proposals; deterministic failures cannot
be approved. Legacy agent proposals must be recreated. Jev outages or missing credentials
produce an explicit manual-review result rather than a passing semantic verdict.

These checks apply to agent listing proposals, not the separate direct listing editor or
find/replace workflow. An acknowledgement is not proof of human identity: the existing
write-scoped agent endpoint can still approve. This change does not implement a human-only
authorization boundary. No evaluator writes to Etsy or predicts keyword demand/sales.

Run the isolated regression checks and starter dataset (after `npm install`):

```bash
npm run test:evals
npm run evals
# Optional paid evaluation of the six synthetic cases:
npm run evals -- --jev
```

The dataset includes relevant rewrites, unrelated keywords, invented claims, stuffing,
duplicate tags and unresolved templates. The thresholds are starting assumptions, not
calibrated guarantees. Add seller-labelled examples and a separate held-out test set before
claiming model accuracy. Track false-ready suggestions, label agreement, manual-review
rate, API failures, cost and latency. Measuring traffic or sales requires actual shop data.

## Prerequisites

- Docker Desktop or Docker Engine with Compose support
- Git
- Optional for live Etsy auth: an Etsy developer app, valid API credentials, and a public HTTPS callback URL such as an ngrok tunnel

## Getting Etsy API Credentials

If you want to connect a real Etsy shop, you need an Etsy Open API app first.

1. Sign in to Etsy and open the developer portal at [Etsy Open API v3](https://developers.etsy.com/documentation/).
2. Open [Your Apps](https://www.etsy.com/developers/your-apps).
3. Choose **Create a New App**.
4. After Etsy creates the app, copy the **API key keystring** and **shared secret** from your app details.
5. Put those values in your local `.env` file as `ETSY_API_KEY` and `ETSY_SHARED_SECRET`.

If you are only testing the mock/demo mode, you can leave those values as placeholders and keep `MOCK_ETSY=true`.

## Getting an ngrok Callback URL

Etsy OAuth needs a public HTTPS callback URL. ngrok is the easiest way to expose your local app while you are developing.

1. Create an ngrok account and install the ngrok CLI.
2. Authenticate the CLI with your ngrok account token.
3. Start a tunnel to the API port:

```bash
ngrok http 4000
```

4. Copy the `https://` forwarding URL ngrok prints, then append the Etsy callback path:

```bash
https://your-ngrok-domain.ngrok-free.app/api/auth/etsy/callback
```

5. Put that full URL in `ETSY_REDIRECT_URI` in your `.env` file.
6. Add the exact same URL to the redirect/callback URL settings for your Etsy app.

If you restart ngrok and it gives you a new forwarding URL, update both Etsy and your local `.env` to match before trying OAuth again.

## Quick start

```bash
git clone https://github.com/fractionite/hermetsy.git
cd hermetsy
cp .env.example .env
docker compose up --build
```

In another terminal:

```bash
docker compose exec api npm run db:migrate --workspace @etsybot/database
docker compose exec api npm run db:seed --workspace @etsybot/database
```

Open:

- Web: http://localhost:3000
- API: http://localhost:4000/health

Keep `MOCK_ETSY=true` and `ETSY_WRITE_DISABLED=true` for the preview demo. The API also
runs migrations automatically at startup. The manual migration command is useful if
you need to rerun them. Change `WEB_PORT` and `API_PORT` in `.env` if these ports are busy;
update `WEB_BASE_URL` to match the web port.

### Try an evaluated proposal

After seeding, the mock mug has listing ID `1001`. Replace the placeholder read token
in `.env` with a local token of your choice, then restart the API. Use that token below:

```bash
curl http://localhost:4000/v1/listings/1001/proposals \
  -H 'Authorization: Bearer YOUR_LOCAL_READ_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Sample Ceramic Mug, Handmade Gift","tags":["ceramic mug","handmade gift"]}'
```

The response includes the evaluation and an operation ID. Open
`http://localhost:3000/operations/OPERATION_ID` to inspect the suggestion review.
Rules mode leaves semantic judgments for manual review. Approval requires an explicit
acknowledgement and queues work; writes remain disabled in the default demo configuration.

## Persistence note

Postgres now uses a named Docker volume, so your Etsy OAuth tokens and connected shop survive normal container restarts.

Avoid `docker compose down -v` or `make down-volumes` unless you intentionally want to wipe the database and re-authenticate from scratch.

## Local seed data

After migrations, run:

```bash
make seed
```

This seeds a mock Etsy shop plus two sample listings so you can explore listing previews.
Rollback requires a prior successfully applied operation and end-to-end verification.

## Etsy redirect URI

Set `ETSY_REDIRECT_URI` to the exact HTTPS callback URL you registered in Etsy. For local development, that usually means an ngrok URL such as:

```bash
ETSY_REDIRECT_URI=https://your-ngrok-domain.ngrok-free.app/api/auth/etsy/callback
```

The app sends this value verbatim in the OAuth request, so it must match Etsy's registered redirect URI exactly.

## Real Etsy mode

To use live listings instead of the seeded mock data:

```bash
MOCK_ETSY=false
ETSY_API_KEY=your_keystring
ETSY_SHARED_SECRET=your_shared_secret
ETSY_REDIRECT_URI=https://your-public-ngrok-domain.ngrok-free.app/api/auth/etsy/callback
```

The callback now exchanges the authorization code for real Etsy access and refresh tokens, calls `getMe` to discover your live shop id when possible, and stores the shop record for live syncs. If Etsy does not expose a shop id from `getMe`, you can still set `ETSY_SHOP_ID` manually as a fallback.

## Connecting Hermes Agent

Once Etsy approves your app credentials, you can wire this project into [Hermes Agent](https://github.com/nousresearch/hermes-agent). I recommend running Hermes in a Docker container for security and isolation. In my setup, Hermes uses OpenRouter for model access.

Basic flow:

1. Mount this repo into the Hermes container so it can read the source and any skills you add.
2. Set the Etsy environment variables in the container, especially `ETSY_API_KEY`, `ETSY_SHARED_SECRET`, `ETSY_REDIRECT_URI`, and `MOCK_ETSY=false`.
3. Configure Hermes to use OpenRouter as the model provider, then run the gateway setup for your chosen chat platform. Discord is a good default, but Telegram, Slack, WhatsApp, Signal, and Email are also supported by Hermes.
4. Start the gateway and connect the bot to your chat account.
5. Use the gateway to invoke your Etsy workflow prompts against the repository.

Hermes also supports skills, so you can keep an Etsy-specific skill alongside this repo and call it from the agent when you want listing guidance or a review pass.

## Optional Etsy Listing Growth Skill

The growth skill mentioned here is not bundled in this repository. If you have authored
an Etsy listing growth skill, add its markdown file in Hermes' user skills directory
inside the container:

```bash
~/.hermes/skills/openclaw-imports/etsy-listing-growth.md
```

Then restart Hermes or reload skills, and confirm it is available with the Hermes skills command. From there you can invoke it by name from a Hermes conversation when you want listing analysis, keyword targeting, or conversion checks.

## Licence

[MIT](LICENSE). You are welcome to try it, adapt it and share feedback.
