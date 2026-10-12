# Closed Beta Deployment: play.bidazoo.com (Option A, Studio PC)

Status: **PLAN AND STUDIO-PC CHECKLIST. October 12, 2026. NOT DEPLOYED.** Nothing in this
document has been run. The authoring session has no Cloudflare access and no deployment has been
performed. Do not describe BidaZoo as live until Jonathan confirms the external endpoint works
(step 11).

Baseline: `main` at `1a106bc` (Checkpoint D closed; validated commit `52547a3`). The beta
deploys the **current guest-only build**. It does not depend on the identity proposal in
[IDENTITY-MIGRATION-ASSESSMENT.md](IDENTITY-MIGRATION-ASSESSMENT.md).

This is a closed-beta architecture, not necessarily the permanent production architecture.

## 1. Decisions already made (from the project owner)

- Studio PC runs the Fastify API, PostgreSQL, Caddy, and cloudflared, behind a **dedicated
  Cloudflare Tunnel for BidaZoo**.
- One public origin: `https://play.bidazoo.com`. Static client at `/`, API at `/api/*` on the same
  hostname. **No `api.bidazoo.com`.** The same-origin cookie and CSP design is preserved.

## 2. Off limits (do not touch)

`jonabalos.com`, `djwikka.com`, any existing Cloudflare Tunnel, any unrelated Caddy site block,
any unrelated DNS record, and any zone-wide SSL setting (stop and report impact first). Every
step below creates only new, BidaZoo-named things.

## 3. Target layout

```text
Internet -> Cloudflare edge (bidazoo.com zone, TLS) -> dedicated BidaZoo tunnel
   -> cloudflared (BidaZoo connector, Studio PC)
   -> BidaZoo Caddy  127.0.0.1:8480   (new, separate instance)
        /api/*  -> BidaZoo API 127.0.0.1:3101
        else    -> static client  C:\BidaZoo-beta\app\apps\play\dist
   API -> PostgreSQL 16 (new BidaZoo-only cluster) 127.0.0.1:54340
```

Everything listens on loopback only. Nothing is exposed except through the tunnel.

### Why a separate Caddy instance (recommended)

The existing Caddy (`C:\Caddy`, Windows service, port 80, admin `localhost:2019`) serves live
sites. Editing its Caddyfile or reloading it puts every existing site inside this change's blast
radius. A second Caddy process on its own port, with its own config and `admin off`, touches
nothing existing. The tunnel points at that instance. If you prefer one Caddy, the alternative is
to add one new site block to the shared file, but that edits an unrelated file and is not
recommended for this beta.

### Ports chosen (all loopback)

| Component | Port | Why |
| --- | --- | --- |
| BidaZoo API | 3101 | Not 3001: `scripts\validate-studio` refuses to run if 3001 is busy, so the beta must not hold it. |
| BidaZoo Caddy | 8480 | Clear of existing apps (8080-8087, 8787, 80, 2019). |
| BidaZoo PostgreSQL | 54340 | Distinct from the validation cluster (54329). |

Part of step 0 verifies these are free.

### Dedicated paths (all new)

```text
C:\BidaZoo-beta\
  app\          git checkout of jabbalos/bidazoo at an exact commit
  config\       api.env, Caddyfile.beta, tunnel.token      (restricted ACL, never in git)
  pg\           PostgreSQL binaries and data (new cluster)
  logs\         api, caddy, tunnel, postgres
  backups\      nightly pg_dump files
  bin\          caddy.exe, cloudflared.exe (copies, so existing installs are not touched)
```

## 4. Known deployment hazards found in this review

1. **Client IP behind the tunnel.** Cloudflare to cloudflared to Caddy to API means the API's
   socket peer is always `127.0.0.1`. With `TRUST_PROXY` unset, every visitor shares one IP and
   the per-IP limits (including the 30-per-minute new-guest burst) would throttle the whole beta
   as one person. With `TRUST_PROXY=loopback`, the API uses the right-most `X-Forwarded-For`
   entry that is not loopback, so Caddy must **overwrite** `X-Forwarded-For` with Cloudflare's
   `CF-Connecting-IP`. The Caddyfile below does this. This is safe only because Caddy listens on
   loopback and the only thing that can reach it is the BidaZoo tunnel, whose edge sets
   `CF-Connecting-IP` itself. Do not expose Caddy's port any other way.
2. **`cloudflared` Windows service name clash.** `cloudflared service install` registers a
   service named `Cloudflared`; an existing tunnel may already use it. This plan never runs it.
   The connector runs as its own scheduled task.
3. **`cloudflared tunnel login` writes `%USERPROFILE%\.cloudflared\cert.pem`**, which could
   replace the certificate used to manage existing tunnels. This plan avoids `tunnel login`
   entirely by creating a **remotely managed tunnel in the Cloudflare dashboard** and running the
   connector with a token.
4. **Validation cluster is not for beta.** The portable cluster in `%USERPROFILE%\BidaZoo-pg`
   uses trust authentication on 54329 for throwaway data. Do not reuse it.
5. **`Secure` cookie needs the flag set.** Caddy speaks plain HTTP to the API, so set
   `COOKIE_SECURE=true` explicitly (also the default under `NODE_ENV=production`).
6. **Shared Studio PC.** If the PC sleeps, reboots for updates, or loses power or internet, the
   beta is down. Set the power plan to never sleep and confirm tasks start at boot.
7. **Caddy's `header` directive replaces, and would clobber Fastify's validated API headers.**
   The API already sends its own checked header set on every response (CSP `default-src 'none'`,
   `Cache-Control: no-store`, `X-Frame-Options`, and the rest; see SECURITY.md). A site-level
   Caddy `header { ... }` would overwrite those on `/api/*` with the *client* policy, which is
   more permissive. The Caddyfile below therefore adds its security headers **only inside the
   static-file handler** and adds nothing to API responses. Step 11 proves the API headers arrive
   unchanged.
8. **Forwarded protocol and host must be stated, not inherited.** From Caddy's point of view the
   connection from cloudflared is plain HTTP on loopback, so Caddy's defaults would tell the API
   `http` and its own view of the host. Fastify (with `TRUST_PROXY=loopback`) trusts
   `X-Forwarded-Proto` and `X-Forwarded-Host` from a loopback peer. If a client-supplied
   `X-Forwarded-Host` ever reached Fastify unchanged, `request.hostname` would become
   attacker-chosen (tested against Fastify 5.12.5: a forwarded `evil.example` was reported as the
   hostname). Today the API's own code reads only `request.ip` (rate limits) and the raw `Host`
   header (same-origin check) and does not branch on protocol, and the `Secure` cookie comes from
   `COOKIE_SECURE`, not from the proxy. That is not a reason to leave the values wrong: later
   code, logging, or an HTTPS redirect would be misled. The Caddyfile sets all three forwarded
   values explicitly (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`) and Step 10
   verifies what Fastify actually observes through the real external path.

## 5. Checklist (run on the Studio PC)

Run in an elevated PowerShell where a step says so. Do not paste secrets into chat; they stay in
files under `C:\BidaZoo-beta\config`.

### Step 0. Read-only preflight (nothing is changed)

```powershell
Get-NetTCPConnection -LocalPort 3101,8480,54340 -State Listen -ErrorAction SilentlyContinue
Get-ScheduledTask | Where-Object { $_.TaskName -like '*BidaZoo*' -or $_.TaskName -like '*cloudflared*' -or $_.TaskName -like '*Tunnel*' } | Select-Object TaskName, State
Get-Service | Where-Object { $_.Name -like '*cloudflared*' -or $_.DisplayName -like '*Cloudflare*' -or $_.Name -like '*caddy*' } | Select-Object Name, Status
Get-Process cloudflared, caddy -ErrorAction SilentlyContinue | Select-Object Name, Id, Path
node --version; git --version
```

Expected: the three ports print nothing; you see your existing Caddy and any existing
cloudflared entries (record them; do not change them). If any port is busy, stop and pick another
before continuing. These inline commands are authoritative and need nothing else. An optional
read-only convenience script that runs the same checks ships **separately**, as tooling, in
`infrastructure/deployment/closed-beta/00-preflight.bat` (its own commit, not part of this
document's commit). The checklist does not depend on it.

### Step 1. Create folders and lock them down

```powershell
New-Item -ItemType Directory -Force C:\BidaZoo-beta\app,C:\BidaZoo-beta\config,C:\BidaZoo-beta\pg,C:\BidaZoo-beta\logs,C:\BidaZoo-beta\backups,C:\BidaZoo-beta\bin | Out-Null
icacls C:\BidaZoo-beta\config /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "$env:USERNAME:(OI)(CI)F"
```

### Step 2. New PostgreSQL 16 cluster (BidaZoo only)

Use the same EnterpriseDB PostgreSQL 16 Windows binaries ZIP you already use for validation
(extract a fresh copy to `C:\BidaZoo-beta\pg\pgsql`). Then, as a normal user:

```powershell
$pgbin = "C:\BidaZoo-beta\pg\pgsql\bin"
# Generate two passwords into files; do not echo them.
$superPw = [Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Max 256 }))
$appPw   = ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N'))
Set-Content -NoNewline C:\BidaZoo-beta\config\pg-super.pw $superPw
Set-Content -NoNewline C:\BidaZoo-beta\config\pg-app.pw $appPw
& "$pgbin\initdb.exe" -D C:\BidaZoo-beta\pg\data -U postgres --auth=scram-sha-256 --pwfile=C:\BidaZoo-beta\config\pg-super.pw -E UTF8
Add-Content C:\BidaZoo-beta\pg\data\postgresql.conf "`nlisten_addresses = '127.0.0.1'`nport = 54340"
& "$pgbin\pg_ctl.exe" -D C:\BidaZoo-beta\pg\data -l C:\BidaZoo-beta\logs\postgres.log start
$env:PGPASSWORD = Get-Content -Raw C:\BidaZoo-beta\config\pg-super.pw
& "$pgbin\psql.exe" -h 127.0.0.1 -p 54340 -U postgres -c "CREATE ROLE bidazoo_app LOGIN PASSWORD '$appPw'" -c "CREATE DATABASE bidazoo OWNER bidazoo_app"
Remove-Item Env:PGPASSWORD
```

Check `pg_hba.conf` allows only `127.0.0.1/32` and `::1/128` with `scram-sha-256` (the `initdb`
flag sets this). Confirm the data directory is not world-readable.

### Step 3. Get the exact code and build

As a normal user (not elevated):

```powershell
cd C:\BidaZoo-beta\app
git clone https://github.com/jabbalos/bidazoo .
git checkout 1a106bc   # or a later commit you have approved; record it
git status --short     # must print nothing
npm ci
npm run build
npm run scan:client    # must report CLEAN
```

### Step 4. API environment file

Create `C:\BidaZoo-beta\config\api.env` (never committed). Replace the password placeholder with
the contents of `pg-app.pw` locally:

```text
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3101
DATABASE_URL=postgres://bidazoo_app:REPLACE_WITH_pg-app.pw@127.0.0.1:54340/bidazoo
COOKIE_SECURE=true
TRUST_PROXY=loopback
# Leave HSTS off until HTTPS is final and you are sure; it is sticky in browsers.
HSTS_MAX_AGE_SECONDS=0
```

`ALLOWED_ORIGINS` is deliberately **unset**. The API's same-origin check then passes only when
the browser's `Origin` host equals the `Host` header the API receives, so a wrong `Host` fails
closed and is noticed. Listing `https://play.bidazoo.com` there would mask exactly that mistake.
Rate-limit variables stay at their validated defaults.

### Step 5. Apply migrations to the beta database

```powershell
cd C:\BidaZoo-beta\app
$env:DATABASE_URL = (Select-String -Path C:\BidaZoo-beta\config\api.env -Pattern '^DATABASE_URL=').Line.Substring(13)
npm run db:migrate
Remove-Item Env:DATABASE_URL
```

Expect all migrations to apply (0000, 0001, 0002 and any later ones in `database/migrations`).

### Step 6. Start the API and test it locally (before any tunnel)

```powershell
cd C:\BidaZoo-beta\app
node --env-file=C:\BidaZoo-beta\config\api.env apps\api\dist\server.js
```

In a second window:

```powershell
curl.exe -s http://127.0.0.1:3101/health
curl.exe -s http://127.0.0.1:3101/ready
```

Expect `/health` 200 and `/ready` 200. Stop the API (Ctrl+C) once confirmed; step 8 makes it
permanent.

### Step 7. Separate BidaZoo Caddy

Download Caddy for Windows from the official Caddy site, check its signature or checksum, and
copy it to `C:\BidaZoo-beta\bin\caddy.exe` (do not replace `C:\Caddy\caddy.exe`). Create
`C:\BidaZoo-beta\config\Caddyfile.beta`:

```caddy
{
	auto_https off
	admin off
	persist_config off
}

http://play.bidazoo.com:8480 {
	bind 127.0.0.1

	# Cloudflare states the visitor's scheme in CF-Visitor ({"scheme":"https"}). This beta serves
	# HTTPS only: anything else is sent to HTTPS and never reaches the API or the files. Because of
	# this, the "https" forwarded to the API below is true, not assumed.
	@not_https {
		not {
			header_regexp cfv CF-Visitor `"scheme"\s*:\s*"https"`
		}
	}
	handle @not_https {
		redir https://play.bidazoo.com{uri} 308
	}

	# API: pass through untouched. NO header directive here, so every response header Fastify sends
	# (the validated API set) reaches the browser exactly as sent. The three forwarded values are
	# set explicitly and OVERWRITE anything the client supplied:
	#   X-Forwarded-For   = the visitor address Cloudflare vouches for (CF-Connecting-IP)
	#   X-Forwarded-Proto = https (guaranteed by the redirect above)
	#   X-Forwarded-Host  = the Host this site matched
	# Only the BidaZoo tunnel can reach this port (loopback), and the API runs TRUST_PROXY=loopback.
	handle /api/* {
		reverse_proxy 127.0.0.1:3101 {
			header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
			header_up X-Forwarded-Proto https
			header_up X-Forwarded-Host {http.request.host}
			header_up -X-Real-IP
		}
	}

	# Static client: the browser-facing security headers are added HERE ONLY.
	handle {
		header {
			Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
			X-Content-Type-Options nosniff
			Referrer-Policy no-referrer
			X-Frame-Options DENY
			Cross-Origin-Opener-Policy same-origin
			Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
		}
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		@shell path / /index.html
		header @shell Cache-Control "no-cache"
		root * C:/BidaZoo-beta/app/apps/play/dist
		try_files {path} /index.html
		file_server
	}

	log {
		output file C:/BidaZoo-beta/logs/caddy-access.log {
			roll_size 20mb
			roll_keep 5
		}
	}
}

# Anything addressed to another hostname on this port gets nothing.
http://:8480 {
	bind 127.0.0.1
	respond 404
}
```

Validate before running (this session had no Caddy binary, so the file has **not** been
validated; treat any `validate` error as authoritative and fix the syntax, keeping the behavior):
`C:\BidaZoo-beta\bin\caddy.exe validate --config C:\BidaZoo-beta\config\Caddyfile.beta --adapter caddyfile`.

Notes:

- The `header` block sits inside the static handler on purpose. `header` *replaces* a response
  header's value, so a site-level block would overwrite Fastify's validated API headers (hazard 7).
  The Caddy `Server` header and Cloudflare's own transport headers are the only things added to API
  responses.
- Do not set HSTS here yet. The client CSP is also embedded in the built `index.html`; the header
  adds `frame-ancestors` protection.
- Local `curl` tests against port 8480 must imitate what Cloudflare sends, or the redirect rule
  will (correctly) answer 308. Add `-H "Host: play.bidazoo.com"`, `-H "CF-Connecting-IP: 203.0.113.9"`
  and `-H 'CF-Visitor: {\"scheme\":\"https\"}'` (PowerShell 5.1 quoting; PowerShell 7 can use plain
  quotes).

### Step 8. Run Postgres, the API and Caddy permanently (scheduled tasks, no Windows service)

This matches how the other Studio apps run (a SYSTEM task at startup with a restart loop). Create
`C:\BidaZoo-beta\bin\run-api.cmd`:

```bat
@echo off
cd /d C:\BidaZoo-beta\app
:loop
"C:\Program Files\nodejs\node.exe" --env-file=C:\BidaZoo-beta\config\api.env apps\api\dist\server.js >> C:\BidaZoo-beta\logs\api.log 2>&1
timeout /t 5 /nobreak >nul
goto loop
```

and `run-caddy.cmd` equivalently with
`C:\BidaZoo-beta\bin\caddy.exe run --config C:\BidaZoo-beta\config\Caddyfile.beta --adapter caddyfile`.
Register tasks named exactly `BidaZoo Postgres` (runs `pg_ctl ... start`, or `postgres.exe -D ...`),
`BidaZoo API`, and `BidaZoo Caddy`, each At startup, SYSTEM, highest privileges. **Start only
`BidaZoo Postgres` and `BidaZoo Caddy` now.** Register `BidaZoo API` but leave it stopped: step 10
borrows port 3101 for the observation harness, and step 11 starts the real API.

Check Caddy locally (imitating Cloudflare, per the notes above):

```powershell
curl.exe -s -i -H "Host: play.bidazoo.com" -H 'CF-Visitor: {\"scheme\":\"https\"}' http://127.0.0.1:8480/
curl.exe -s -i -H "Host: play.bidazoo.com" http://127.0.0.1:8480/      # no CF-Visitor: expect 308 to https
```

Expect the page (with the client CSP header) for the first, and a 308 for the second.

### Step 9. Cloudflare (dashboard, bidazoo.com zone and Zero Trust only)

1. Confirm the zone you are in is **bidazoo.com**. Do not open `jonabalos.com` or `djwikka.com`
   settings.
2. Zero Trust, Networks, Tunnels, **Create a tunnel**, type Cloudflared, name it
   **`bidazoo-beta`** (a new tunnel). Copy its install token into
   `C:\BidaZoo-beta\config\tunnel.token`. Do not paste it into chat.
3. On the tunnel's **Public hostname** tab add exactly one route and set it as follows:
   - Hostname: `play.bidazoo.com`
   - Service: **HTTP**, URL `127.0.0.1:8480`
   - Under **Additional application settings, HTTP Settings**, set **HTTP Host Header** to
     **`play.bidazoo.com`** explicitly. Do not leave it blank or rely on the default pass-through.
     The Caddy site block matches on this exact Host, the API's same-origin check compares the
     browser's `Origin` host with the Host it receives, and an explicit value makes both
     independent of how the dashboard or a future edit treats the default.

   Cloudflare creates the proxied CNAME for `play.bidazoo.com` automatically. Create no other DNS
   record and no `api.` record.
4. SSL/TLS: tunnel traffic is encrypted to the edge regardless of the zone mode, so **change no
   SSL/TLS setting**. If a change ever seems needed, stop and report the impact first.
5. Do not enable Always Use HTTPS, HSTS, or Rocket Loader-style optimizations yet (Caddy already
   redirects non-HTTPS requests). Leave bot and WAF defaults. (Optional, strongly consider: a
   Cloudflare Access policy limiting `play.bidazoo.com` to invited emails for the closed beta. It
   adds a login in front of the game, which is exactly what "closed" means, but test with one real
   device first.)
6. Copy `cloudflared.exe` to `C:\BidaZoo-beta\bin\` (a copy, so the existing install is not
   touched). Create `run-tunnel.cmd`:

```bat
@echo off
:loop
set /p TUNNEL_TOKEN=<C:\BidaZoo-beta\config\tunnel.token
C:\BidaZoo-beta\bin\cloudflared.exe tunnel --no-autoupdate --logfile C:\BidaZoo-beta\logs\tunnel.log run
timeout /t 10 /nobreak >nul
goto loop
```

   Register it as the scheduled task `BidaZoo Tunnel` (At startup, SYSTEM) and start it. Do **not**
   run `cloudflared service install` and do **not** run `cloudflared tunnel login`.
7. In the dashboard the `bidazoo-beta` tunnel should show **Healthy**, and the route should show
   the Host Header setting you entered.

### Step 10. What Fastify actually observes (IP, protocol, host) through the real external path

Goal: prove, before any family uses it, that a Fastify configured exactly like the API
(`trustProxy: ['loopback']`, which is what `TRUST_PROXY=loopback` parses to) sees the real
visitor address, `https`, and `play.bidazoo.com` when a request arrives from the internet through
Cloudflare, the tunnel, and Caddy. Header names alone prove nothing; this checks the interpretation.

The harness is a throwaway file kept **outside the repository** (`C:\BidaZoo-beta\tmp`), not
committed anywhere. It borrows Fastify from the checkout so the version is the same. Port 3101
must be free, so the real API task must still be stopped.

Save as `C:\BidaZoo-beta\tmp\observe.mjs`:

```js
// Throwaway header-observation harness. NOT part of the repository.
import { createRequire } from 'node:module';
const from = process.env.OBSERVE_FASTIFY_FROM;
if (!from) throw new Error('Set OBSERVE_FASTIFY_FROM to the path of apps/api/package.json in the checkout');
const Fastify = createRequire(from)('fastify');
const app = Fastify({ trustProxy: ['loopback'], logger: false });
app.all('/*', async (request) => ({
  fastify: { ip: request.ip, ips: request.ips, protocol: request.protocol, hostname: request.hostname },
  raw: {
    socket: request.socket.remoteAddress,
    host: request.headers['host'] ?? null,
    'x-forwarded-for': request.headers['x-forwarded-for'] ?? null,
    'x-forwarded-proto': request.headers['x-forwarded-proto'] ?? null,
    'x-forwarded-host': request.headers['x-forwarded-host'] ?? null,
    'cf-connecting-ip': request.headers['cf-connecting-ip'] ?? null,
    'cf-visitor': request.headers['cf-visitor'] ?? null,
  },
}));
await app.listen({ host: '127.0.0.1', port: 3101 });
console.log('observing on 127.0.0.1:3101');
```

Run it (normal user):

```powershell
$env:OBSERVE_FASTIFY_FROM = "C:\BidaZoo-beta\app\apps\api\package.json"
node C:\BidaZoo-beta\tmp\observe.mjs
```

**Check A: an honest request.** From a phone on mobile data (not your home Wi-Fi), open
`https://play.bidazoo.com/api/observe`. Find that phone's public address with any "what is my IP"
page the phone can open. Expected:

| Field | Expected |
| --- | --- |
| `fastify.ip` | the phone's public address (not `127.0.0.1`, not a Cloudflare address) |
| `fastify.protocol` | `https` |
| `fastify.hostname` | `play.bidazoo.com` |
| `raw.host` | `play.bidazoo.com` |
| `raw.x-forwarded-for` | exactly one value, equal to `fastify.ip` (no comma) |
| `raw.x-forwarded-proto` | `https` |
| `raw.x-forwarded-host` | `play.bidazoo.com` |
| `raw.socket` | `127.0.0.1` |

**Check B: hostile headers.** From the Studio PC (or a laptop), send forged forwarding headers
through the full external path:

```powershell
curl.exe -s https://play.bidazoo.com/api/observe -H "X-Forwarded-For: 6.6.6.6" -H "X-Forwarded-Proto: http" -H "X-Forwarded-Host: evil.example" -H "CF-Connecting-IP: 7.7.7.7" -H "X-Real-IP: 8.8.8.8"
```

Expected: the **same** answers as Check A for protocol and hostname, and `fastify.ip` equal to the
Studio PC's real public address, never `6.6.6.6`, `7.7.7.7`, or `8.8.8.8`.

**Check C: plain HTTP.** `curl.exe -s -i http://play.bidazoo.com/api/observe` must return a 3xx
redirect to `https://` (from Cloudflare or from Caddy) and never the JSON.

If a check fails, stop and do not start the API:

- `fastify.ip` is `127.0.0.1`: the `X-Forwarded-For` override is not taking effect (Caddy
  `header_up` syntax, or the tunnel is not delivering `CF-Connecting-IP`). Every visitor would
  share one rate-limit bucket.
- `fastify.hostname` is not `play.bidazoo.com`: the tunnel's HTTP Host Header (step 9.3) is not
  set, or `X-Forwarded-Host` is not being overwritten.
- `fastify.protocol` is `http`: the `X-Forwarded-Proto` line or the redirect rule is not in effect.

Stop the harness (Ctrl+C). It is outside the repository and can be deleted.

### Step 11. Start the real API and verify the real service (this is what makes it "live")

1. Start the `BidaZoo API` task. Locally: `curl.exe -s http://127.0.0.1:3101/health` and `/ready`
   (both 200).
2. **Real API, host:** with `ALLOWED_ORIGINS` unset, a request succeeds only if the API received the
   Host it expects:

   ```powershell
   curl.exe -s -i -X POST https://play.bidazoo.com/api/v1/guest -H "Origin: https://play.bidazoo.com" -H "Content-Type: application/json" -d "{}"
   curl.exe -s -i -X POST https://play.bidazoo.com/api/v1/guest -H "Origin: https://evil.example" -H "Content-Type: application/json" -d "{}"
   ```

   Expect a 2xx with `Set-Cookie: __Host-...; Secure; HttpOnly` for the first and `403
   forbidden_origin` for the second.
3. **Real API, address (through the real limiter):** temporarily add
   `RATE_GUEST_CREATE_BURST_MAX=3` to `api.env`, restart the `BidaZoo API` task, and from the
   Studio PC run the first command above four times with no cookie jar so each creates a new guest.
   The fourth must return `429 rate_limited` with `Retry-After`. Then, from a phone on mobile data,
   open `https://play.bidazoo.com`: it must still work, because it is a different address. If the
   phone is throttled too, the API is not seeing distinct visitors. Remove the override and
   restart the task afterward. (This creates about three throwaway guest rows; they are harmless.)
4. **API headers are Fastify's, unchanged by Caddy and the tunnel.** Compare an API response
   directly and through the public path:

   ```powershell
   curl.exe -s -D - -o NUL http://127.0.0.1:3101/api/v1/me
   curl.exe -s -D - -o NUL https://play.bidazoo.com/api/v1/me
   ```

   Both (401 without a cookie is fine) must show the same values for `Content-Security-Policy`
   (`default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, **not** the
   client policy with `script-src 'self'`), `Cache-Control: no-store`, `X-Content-Type-Options`,
   `Referrer-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Opener-Policy`,
   `X-Frame-Options`, and `Permissions-Policy`. Only transport headers (`Date`, `Server`, `Via`,
   `Alt-Svc`, `Cf-*`) may differ. Then `curl.exe -s -I https://play.bidazoo.com/` must show the
   *client* CSP, the same headers from the static handler, and `Cache-Control: no-cache`.
5. From a phone on mobile data, open `https://play.bidazoo.com`, see the five starters, and play a
   full 10-question run. Reload mid-run: the same question returns (no clock reset).
6. Confirm the existing sites still work: `jonabalos.com`, `hopquest.jonabalos.com`,
   `djwikka.com`. Nothing about them should have changed.
7. Only after steps 1 to 6 pass does Jonathan confirm to the project record that the closed-beta
   endpoint works.

### Step 12. Backups and operations (before inviting anyone)

- Nightly `pg_dump` task to `C:\BidaZoo-beta\backups` (custom format, keep 14), plus a periodic
  copy off the PC. **Test one restore into a scratch database** before relying on it.
- Log rotation for `api.log` and `tunnel.log` (Caddy rolls its own). The API logs remote
  addresses; decide retention (SECURITY.md lists retention as undecided).
- Windows: power plan never sleep, update restarts outside play hours, tasks verified to start
  after a reboot.
- A short "beta is down" note for invited families, and a way to turn the beta off quickly
  (disable the `BidaZoo Tunnel` task or the public hostname).

## 6. Rollback (everything is additive)

1. Dashboard: delete the `play.bidazoo.com` public hostname (and its CNAME) or the `bidazoo-beta`
   tunnel.
2. Stop and unregister `BidaZoo Tunnel`, `BidaZoo Caddy`, `BidaZoo API`, `BidaZoo Postgres`.
3. Optionally delete `C:\BidaZoo-beta` (after taking a final backup if any family data exists).

No existing site, tunnel, Caddy block, DNS record, or SSL setting was modified, so there is
nothing of theirs to restore.

## 7. Residual risks accepted for the closed beta

Single PC and home internet; in-process rate limits reset on restart and are per process; no
CAPTCHA and no distributed-attack defense beyond Cloudflare's defaults; the service-wide
new-guest breaker can be opened by a many-address attacker; no audit logging yet; clearing
cookies loses a guest's progress until the identity checkpoint; children's-data consent and legal
review still pending before real children are invited (SECURITY.md). Cloudflare Access (step 9.5)
and an invite-only list are the main mitigations for abuse during the beta.

## 8. Not verified

- None of these steps has been run. Windows path handling, `initdb`/`pg_ctl` as the intended
  user, Caddy path syntax with forward slashes, the scheduled-task registrations, and the
  `set /p` token read have not been exercised in this session.
- The Caddyfile has not been validated or run (no Caddy binary was available to the authoring
  session). In particular, confirm with `caddy validate` the named-matcher `not { header_regexp ... }`
  form, that `header_up` overrides Caddy's own `X-Forwarded-*` values as intended, and the
  `handle @not_https` redirect. Step 10 exists to catch exactly these.
- The observation harness was exercised only against Fastify 5.12.5 with hand-made headers (it
  confirmed, for example, that an unrewritten `X-Forwarded-Host` would become `request.hostname`).
  It has not been run behind Caddy, the tunnel, or Cloudflare.
- Cloudflare dashboard labels (including **HTTP Host Header** under HTTP Settings) may differ
  slightly from the wording above.
- Whether a Cloudflare Access policy in front of the game interacts badly with the same-origin
  cookie model has not been tested.
