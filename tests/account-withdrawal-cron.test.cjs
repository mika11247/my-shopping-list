const assert = require("node:assert/strict");
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { createHmac, randomBytes, randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const db = "shopping-withdrawal-cron-db-1";
const storage = "shopping-withdrawal-cron-storage-1";
const url = "http://storage:35540/api/delete-user";
const dispatch = `app_private.dispatch_account_withdrawal('${url}')`;
const sql = (input) => execFileSync("docker", ["exec", "-i", db,
  "psql", "-XqAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function testServiceKey() {
  const input = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({
    role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return input + "." + createHmac("sha256", "withdrawal-isolated-test-signing-secret")
    .update(input).digest("base64url");
}

async function waitFor(probe, timeout = 90000) {
  const end = Date.now() + timeout;
  do {
    const value = probe();
    if (value) return value;
    await delay(500);
  } while (Date.now() < end);
  assert.fail("Isolated cron probe timed out");
}

// Runs on the isolated Docker network. It tests the real wire contract and
// durable RPCs without giving pg_net access to the host or the internet.
function fixtureWorker(secret, serviceKey) {
  const { createServer } = require("node:http");
  const { randomUUID } = require("node:crypto");
  let requests = 0;
  const rpc = async (fn, body) => {
    const response = await fetch("http://rest:3000/rpc/" + fn, {
      method: "POST",
      headers: { Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("RPC failed");
    return response.json();
  };
  createServer(async (request, response) => {
    try {
      const parts = [];
      for await (const part of request) parts.push(part);
      if (request.url !== "/api/delete-user" || request.method !== "POST" ||
        request.headers["x-withdrawal-worker"] !== secret ||
        JSON.parse(Buffer.concat(parts)).action !== "worker") {
        response.writeHead(401).end();
        return;
      }
      requests++;
      if (requests === 1) {
        response.writeHead(503, { Connection: "close" }).end();
        return;
      }
      const lease = randomUUID();
      const job = await rpc("claim_account_withdrawal", { p_job: null, p_lease: lease });
      if (job && requests === 2) {
        response.writeHead(503, { Connection: "close" }).end();
        return;
      }
      if (job) {
        const action = job.stage === "storage" ? "storage_done" : "auth_done";
        if (!await rpc("advance_account_withdrawal", { p_job: job.id, p_lease: lease, p_action: action })) {
          throw new Error("Checkpoint rejected");
        }
      }
      response.writeHead(200).end();
    } catch {
      response.writeHead(500).end();
    }
  }).listen(35540, "0.0.0.0", () => console.log("ready " + process.pid));
}

test("native Cron and pg_net dispatch conditionally, protect headers and resume checkpoints", { timeout: 160000 }, async () => {
  const secret = randomBytes(32).toString("hex");
  const worker = spawn("docker", ["exec", "-i", storage, "node", "-"], { stdio: ["pipe", "pipe", "ignore"] });
  const first = randomUUID();
  const second = randomUUID();
  const expired = randomUUID();
  const recent = randomUUID();
  let fixturePid;
  let workerOutput = "";
  worker.stdout.on("data", (data) => {
    workerOutput += data;
    fixturePid = /ready (\d+)/.exec(workerOutput)?.[1];
  });
  worker.stdin.end(`(${fixtureWorker.toString()})(${JSON.stringify(secret)},${JSON.stringify(testServiceKey())});`);
  try {
    await waitFor(() => fixturePid, 10000);
    // Every SQL value interpolated here is a generated fixture or a constant.
    sql(`SELECT vault.create_secret('${secret}', 'account_withdrawal_worker_secret');
      INSERT INTO app_private.account_withdrawals(id, stage, completed_at) VALUES
        ('${expired}', 'complete', now()-interval '31 days'),
        ('${recent}', 'complete', now()-interval '29 days');`);
    sql(`BEGIN;
      SET LOCAL app.withdrawal_cron_allow_isolated_http = 'off';
      DO $$ BEGIN
        BEGIN
          PERFORM ${dispatch};
          RAISE EXCEPTION 'Plaintext worker endpoint accepted';
        EXCEPTION WHEN raise_exception THEN
          IF SQLERRM <> 'Invalid withdrawal worker endpoint' THEN RAISE; END IF;
        END;
      END $$;
      ROLLBACK;`);
    assert.equal(sql(`SELECT ${dispatch} IS NULL`), "t");
    assert.equal(sql(`SELECT public.account_withdrawal_status('${expired}') IS NULL AND
      public.account_withdrawal_status('${recent}') = 'complete'`), "t");
    assert.equal(sql(`SELECT bool_and(NOT has_table_privilege(role, target, 'SELECT'))
      FROM unnest(ARRAY['anon','authenticated']) role
      CROSS JOIN unnest(ARRAY['vault.decrypted_secrets','net.http_request_queue','net._http_response']) target`), "t");
    assert.equal(sql(`SELECT bool_and(NOT has_function_privilege(role,
      'app_private.dispatch_account_withdrawal(text)', 'EXECUTE'))
      FROM unnest(ARRAY['anon','authenticated','service_role']) role`), "t");

    const baseline = sql("SELECT coalesce(max(id),0) FROM net._http_response");
    sql(`INSERT INTO app_private.account_withdrawals(id,stage) VALUES ('${first}', 'storage');
      SELECT cron.schedule('account-withdrawal-dispatch', '* * * * *', $job$SELECT ${dispatch}$job$);`);
    await waitFor(() => sql(`SELECT count(*) FROM net._http_response WHERE status_code=503 AND id>${baseline}`) === "1");
    sql(`SELECT cron.alter_job(jobid, active := false) FROM cron.job WHERE jobname='account-withdrawal-dispatch';`);
    assert.equal(sql(`SELECT stage FROM app_private.account_withdrawals WHERE id='${first}'`), "storage");
    assert.equal(sql("SELECT command FROM cron.job WHERE jobname='account-withdrawal-dispatch'"), "SELECT " + dispatch);

    const unreachable = sql("SELECT app_private.dispatch_account_withdrawal('http://storage:35541/api/delete-user')");
    await waitFor(() => sql(`SELECT count(*) FROM net._http_response WHERE id=${unreachable}`) === "1");
    assert.equal(sql(`SELECT (error_msg IS NOT NULL OR coalesce(timed_out, false))
      FROM net._http_response WHERE id=${unreachable}`), "t");
    const interrupted = sql(`SELECT ${dispatch}`);
    await waitFor(() => sql(`SELECT status_code FROM net._http_response WHERE id=${interrupted}`) === "503");
    assert.equal(sql(`SELECT ${dispatch} IS NULL`), "t");
    // Simulate the passage of the five-minute lease without sleeping.
    sql(`UPDATE app_private.account_withdrawals SET lease_until=now()-interval '1 second' WHERE id='${first}';
      INSERT INTO app_private.account_withdrawals(id,stage) VALUES ('${second}', 'storage');`);
    const [queued, duplicateSkipped] = sql(`BEGIN;
      SELECT ${dispatch};
      SELECT ${dispatch} IS NULL;
      COMMIT;`).split(/\r?\n/);
    assert.equal(duplicateSkipped, "t");
    for (let step = 0; step < 4; step++) {
      const requestId = step === 0 ? queued : sql(`SELECT ${dispatch}`);
      assert.match(requestId, /^\d+$/);
      await waitFor(() => sql(`SELECT status_code FROM net._http_response WHERE id=${requestId}`) === "200");
    }
    assert.equal(sql(`SELECT count(*) FROM app_private.account_withdrawals WHERE id IN ('${first}','${second}') AND stage='complete'`), "2");
    assert.equal(sql(`SELECT ${dispatch} IS NULL`), "t");

    sql(`INSERT INTO cron.job_run_details(jobid, job_pid, database, username, command,status,start_time,end_time)
      SELECT jobid, 0, current_database(), current_user, 'fixture', 'succeeded',
        now()-interval '8 days', now()-interval '8 days' FROM cron.job WHERE jobname='account-withdrawal-dispatch';
      SELECT app_private.prune_account_withdrawal_cron_history();`);
    assert.equal(sql(`SELECT count(*) FROM cron.job_run_details r JOIN cron.job j USING(jobid)
      WHERE j.jobname='account-withdrawal-dispatch' AND r.command='fixture'`), "0");
    const log = spawnSync("docker", ["logs", db], { encoding: "utf8" });
    assert.equal(log.status, 0);
    assert.ok(!(log.stdout + log.stderr).includes(secret), "Cron worker credential appeared in the isolated DB log");
  } finally {
    sql(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='account-withdrawal-dispatch';
      DELETE FROM app_private.account_withdrawals WHERE id IN ('${first}','${second}','${expired}','${recent}');
      DELETE FROM vault.secrets WHERE name='account_withdrawal_worker_secret';`);
    if (fixturePid) execFileSync("docker", ["exec", storage, "kill", fixturePid], { stdio: "ignore" });
    worker.kill();
  }
});
