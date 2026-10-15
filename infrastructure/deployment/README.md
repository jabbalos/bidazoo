# Deployment

This folder was intentionally empty in Checkpoint A. Since then a **guest-only closed beta** has been
deployed at `https://play.bidazoo.com` on the Studio PC. The plan and the as-built record are in
[docs/DEPLOYMENT-CLOSED-BETA.md](../../docs/DEPLOYMENT-CLOSED-BETA.md) (section 9 is the as-built
record, including the backup validation).

- `closed-beta/00-preflight.bat` is a read-only preflight for the closed-beta ports, tasks and
  processes. It changes nothing.
- The scripts the closed beta actually runs (scheduled-task wrappers, the nightly backup) live on the
  Studio PC under `C:\BidaZoo-beta\bin` and are **not** in this repository.
- The closed beta is a closed-beta architecture, not necessarily the final production architecture.
  Final production hosting, CI and data retention are still open decisions
  ([docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), sections 12 and 13).
- BidaZoo does not touch Hop Quest, Fact Crew, jonabalos.com Accounts, the Clickaroo Games Hub, the
  existing Caddy, existing Cloudflare tunnels, or any unrelated domain or service. The closed beta
  uses only new, BidaZoo-named components.
- Release-rehearsal tooling is under `identity-release/` on the release-candidate branch
  `release/founding-family-beta` (it originated on `release/identity-beta`). It takes the release candidate
  as an explicit SHA input, keeps `1a106bc` as the only rollback target, and is labeled untested on the Studio
  PC by its own README. It is not merged into `main`.
