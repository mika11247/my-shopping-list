const assert = require("node:assert/strict");
const { test } = require("node:test");

test("operator notification retries with one key and preserves acceptance if mail fails", async (t) => {
  process.env.RESEND_API_KEY = "test-only";
  process.env.WITHDRAWAL_TEST_MAIL_URL = "http://127.0.0.1:8025/";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321/";
  const { notifyWithdrawalOperator } = await import("../lib/server/account-withdrawal.ts");
  const messages = [];
  let recover = true;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: recover && messages.length === 2 };
  });
  const warning = t.mock.method(console, "warn", () => {});

  await notifyWithdrawalOperator("fixture-job");
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], messages[1]);
  assert.equal(messages[0].key, "withdrawal-operator/fixture-job");
  assert.ok(!messages[0].text.includes("fixture-job"));
  assert.equal(warning.mock.callCount(), 0);

  recover = false;
  messages.length = 0;
  await notifyWithdrawalOperator("fixture-failed-job");
  assert.equal(messages.length, 3);
  assert.ok(messages.every((message) => message.key === messages[0].key));
  assert.equal(warning.mock.callCount(), 1);
});
