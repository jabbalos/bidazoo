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

## Running the tests against a real database

The integration tests check constraints, triggers, and locking, which only PostgreSQL can. Use a
**throwaway** database, never one with data you care about:

```bash
psql -U postgres -c "CREATE DATABASE bidazoo_test"
DATABASE_URL=postgres://postgres:...@localhost:5432/bidazoo_test npm run db:migrate
TEST_DATABASE_URL=postgres://postgres:...@localhost:5432/bidazoo_test npm test
```

Without `TEST_DATABASE_URL`, those tests are skipped (with a loud warning), not passed.

For the browser tests, `npm run test:e2e` starts the API and the Vite preview itself; it needs
`DATABASE_URL` set to a migrated database and a one-time `npx playwright install chromium`.
