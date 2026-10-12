# Development setup

## PostgreSQL 16 (local)

Any local PostgreSQL 16 works. Create a role and database, then point `DATABASE_URL` at them in
your git-ignored `.env`.

```sql
-- run as a PostgreSQL superuser, e.g. psql -U postgres
CREATE ROLE bidazoo LOGIN PASSWORD 'choose-a-local-password';
CREATE DATABASE bidazoo OWNER bidazoo;
```

```text
DATABASE_URL=postgres://bidazoo:choose-a-local-password@localhost:5432/bidazoo
```

Then:

```bash
npm run db:migrate
npm run dev
```

The password above is yours to choose and must never be committed.

## Notes

- A Docker Compose file is intentionally not provided yet; no Docker daemon was available to
  verify one in Checkpoint A. Add one when it can be tested.
- Use a separate database for tests that write data, so development data is never at risk.
