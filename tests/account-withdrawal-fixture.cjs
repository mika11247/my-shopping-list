const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const base = read("tests/fixtures/security-schema.sql")
  .split(/\r?\n/)
  .filter((line) => !/^(CREATE ROLE|CREATE SCHEMA|CREATE TABLE auth\.users|CREATE TABLE storage\.objects|CREATE FUNCTION auth\.uid)/.test(line))
  .join("\n");
process.stdout.write(`
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
` + base + "\n");
for (const sql of [
  "security/sql/authorization.sql",
  "supabase/migrations/20261029053800_my_items_quota.sql",
  "supabase/migrations/20261127000100_shopping_group_transfer.sql",
  "supabase/migrations/20261127000200_account_withdrawal.sql",
  "supabase/migrations/20261127000300_account_withdrawal_write_fence.sql",
]) process.stdout.write(read(sql) + "\n");
process.stdout.write("NOTIFY pgrst, 'reload schema';\n");
