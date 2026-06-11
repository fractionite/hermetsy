# Etsy Listing Assistant

![Hermetsy diagram](docs/hermetsy-diagram.png)

Local Dockerized monorepo for listing sync, dry-run transformations, queued writes, and rollback support.

This copy is sanitized for public sharing. It ships with mock data and placeholder environment values only.

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
cp .env.example .env
docker compose up --build
```

In another terminal:

```bash
docker compose exec api npm run db:migrate --workspace @etsybot/database
```

Open:

- Web: http://localhost:3000
- API: http://localhost:4000/health

## Persistence note

Postgres now uses a named Docker volume, so your Etsy OAuth tokens and connected shop survive normal container restarts.

Avoid `docker compose down -v` or `make down-volumes` unless you intentionally want to wipe the database and re-authenticate from scratch.

## Local seed data

After migrations, run:

```bash
make seed
```

This seeds a mock Etsy shop plus two sample listings so you can test sync, preview, and rollback immediately.

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

## Installing The Etsy Listing Growth Skill

Add the skill as a markdown file in Hermes' user skills directory inside the container:

```bash
~/.hermes/skills/openclaw-imports/etsy-listing-growth.md
```

Then restart Hermes or reload skills, and confirm it is available with the Hermes skills command. From there you can invoke it by name from a Hermes conversation when you want listing analysis, keyword targeting, or conversion checks.

## Local ports

Depending on your Docker Desktop port mapping, the host ports may be remapped. In the current validated setup:

- Web: http://localhost:3001
- API: http://localhost:4001
- Postgres: localhost:5432
- Redis: localhost:6379
