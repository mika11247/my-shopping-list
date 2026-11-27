const assert = require("node:assert/strict");
const { createHmac, randomUUID } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { createInterface } = require("node:readline");
const { test } = require("node:test");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require(process.env.WITHDRAWAL_PLAYWRIGHT_PATH || "@playwright/test");
const path = require("node:path");

const api = "http://127.0.0.1:35539";
const origin = "http://127.0.0.1:35530";
const worker = "withdrawal-local-worker-secret-for-tests";
const pilotTest = process.env.WITHDRAWAL_SCOPED_TEST === "true";
const secret = "withdrawal-isolated-test-signing-secret";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const project = "shopping-withdrawal-cron";
const sql = (input) => execFileSync("docker", ["exec", "-i", project + "-db-1",
  "psql", "-XqAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8" }).trim();

// The DB network stays internal. This test-only relay accepts the exact worker
// contract and forwards via stdio to the real Next.js loopback listener.
function cronRelay(expectedSecret) {
  const { createServer } = require("node:http");
  const { createInterface } = require("node:readline");
  const pending = new Map();
  let sequence = 0;
  createInterface({ input: process.stdin }).on("line", (line) => {
    const { id, status } = JSON.parse(line);
    pending.get(id)?.writeHead(status).end();
    pending.delete(id);
  });
  createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      if (request.method !== "POST" || request.url !== "/api/delete-user" ||
        request.headers["x-withdrawal-worker"] !== expectedSecret ||
        JSON.parse(Buffer.concat(chunks)).action !== "worker") {
        response.writeHead(401).end();
        return;
      }
      const id = ++sequence;
      pending.set(id, response);
      response.on("close", () => pending.delete(id));
      console.log(JSON.stringify({ id }));
    } catch {
      response.writeHead(400).end();
    }
  }).listen(35540, "0.0.0.0", () => console.log(JSON.stringify({ pid: process.pid })));
}

function key(role) {
  const payload = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({
    role, exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
}

function client(jwt) {
  return createClient(api, jwt, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function check(result) {
  assert.ifError(result.error);
  return result.data;
}

async function call(body, headers = {}) {
  const response = await fetch(origin + "/api/delete-user", {
    method: "POST", redirect: "error", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test("a browser withdrawal completes via the real POST worker, Auth, Storage and DB", { timeout: 160000 }, async () => {
  const anon = key("anon");
  const service = key("service_role");
  const admin = client(service);
  const allowed = [randomUUID(), randomUUID()];
  const mail = [];
  const mailbox = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    mail.push(JSON.parse(Buffer.concat(chunks)));
    response.writeHead(200).end();
  });
  await new Promise((resolve) => mailbox.listen(0, "127.0.0.1", resolve));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack",
    "--hostname", "127.0.0.1", "-p", "35530"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service, NEXT_TELEMETRY_DISABLED: "1",
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, "account-withdrawal.fonts.cjs"),
      ACCOUNT_WITHDRAWAL_ENABLED: "true", NEXT_PUBLIC_ACCOUNT_WITHDRAWAL_ENABLED: "true",
      ACCOUNT_WITHDRAWAL_GENERAL_RELEASE_ENABLED: "true",
      ...(pilotTest ? {
        ACCOUNT_WITHDRAWAL_GENERAL_RELEASE_ENABLED: "false", ACCOUNT_WITHDRAWAL_INTAKE_DISABLED: "true",
        WITHDRAWAL_PILOT_UUIDS: allowed.join(","), WITHDRAWAL_PILOT_INTAKE_ENABLED: "true",
        WITHDRAWAL_PILOT_BEGIN_ENABLED: "true",
        WITHDRAWAL_PILOT_WORKER_ENABLED: "true",
      } : {}),
      WITHDRAWAL_WORKER_SECRET: worker, RESEND_API_KEY: "isolated-fixture-mail",
      WITHDRAWAL_TEST_MAIL_URL: "http://127.0.0.1:" + mailbox.address().port,
    },
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  let browser;
  let relay;
  let relayPid;
  let cronRegistered = false;
  let cronCalls = 0;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        if ((await fetch(origin + "/api/delete-user")).status === 405) break;
      } catch {}
      assert.ok(attempt < 40, logs);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    async function user(id) {
      const email = randomUUID() + "@example.test";
      const password = randomUUID();
      const created = check(await admin.auth.admin.createUser({ id, email, password, email_confirm: true })).user;
      if (id) assert.equal(created.id, id);
      const database = client(anon);
      const session = check(await database.auth.signInWithPassword({ email, password })).session;
      check(await database.rpc("save_my_profile", { p_display_name: email.split("@")[0] }));
      return { id: created.id, email, password, database, session };
    }

    const [a, b] = await Promise.all([user(pilotTest ? allowed[0] : undefined), user()]);
    const good = (result) => check(result);
    if (pilotTest) {
      const headers = (accessToken) => ({ Authorization: "Bearer " + accessToken });
      const aHeaders = headers(a.session.access_token);
      const bHeaders = headers(b.session.access_token);
      const otherJob = randomUUID();
      sql(`INSERT INTO app_private.account_withdrawals(id,user_id,stage) VALUES ('${otherJob}','${b.id}','auth');
        INSERT INTO auth.identities (id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at)
        VALUES (gen_random_uuid(),'${a.id}','fixture-${a.id}','google',
          jsonb_build_object('sub','fixture-${a.id}','email','${a.email}','email_verified',true),now(),now(),now()); `);
      const aPasswordPreview = await call({ action: "preview" }, aHeaders);
      assert.equal(aPasswordPreview.status, 200, aPasswordPreview.data.error);
      assert.equal(aPasswordPreview.data.method, "password");
      const [header, payload] = a.session.access_token.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url"));
      const unsignedOAuth = header + "." + encode({ ...claims, amr: [{ method: "oauth", timestamp: Math.floor(Date.now() / 1000) }] });
      const oauthHeaders = headers(unsignedOAuth + "." + createHmac("sha256", secret).update(unsignedOAuth).digest("base64url"));
      assert.equal((await call({ action: "preview" }, oauthHeaders)).data.method, "email");
      for (const action of ["preview", "code", "begin"]) {
        assert.equal((await call({ action, groups: [], password: b.password }, bHeaders)).status, 403);
      }
      assert.equal((await call({ action: "status", id: otherJob })).status, 404);
      assert.equal((await call({ action: "worker" }, { "x-withdrawal-worker": worker })).status, 200);
      assert.equal(sql(`SELECT public.account_withdrawal_status('${otherJob}')`), "pending");
      assert.equal((await call({ action: "begin", groups: [], password: "incorrect" }, aHeaders)).status, 403);
      const begun = await call({ action: "begin", groups: [], password: a.password }, aHeaders);
      assert.equal(begun.status, 202);
      assert.equal((await call({ action: "status", id: begun.data.id })).data.stage, "pending");
      assert.equal(sql(`SELECT stage FROM app_private.account_withdrawals WHERE id='${begun.data.id}'`), "storage");
      for (let step = 0; step < 3; step++) {
        assert.equal((await call({ action: "worker" }, { "x-withdrawal-worker": worker })).status, 200);
      }
      assert.equal((await call({ action: "status", id: begun.data.id })).data.stage, "complete");
      assert.equal(mail.filter(msg => msg.to === a.email).length, 1);
      assert.ok((await admin.auth.admin.getUserById(a.id)).error);
      assert.equal(good(await admin.auth.admin.getUserById(b.id)).user.id, b.id);
      assert.equal(sql(`SELECT (stage='auth' AND lease_id IS NULL) FROM app_private.account_withdrawals WHERE id='${otherJob}'`), "t");
      return;
    }
    const sessionId = (session) => JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url")).session_id;
    const codeCheck = { p_user: a.id, p_session: sessionId(a.session), p_proof: "isolated-fixture-proof" };
    assert.equal(good(await admin.rpc("issue_withdrawal_email_check", codeCheck)), true);
    assert.equal(good(await admin.rpc("issue_withdrawal_email_check", codeCheck)), false);
    assert.equal(good(await admin.rpc("consume_withdrawal_email_check", { ...codeCheck, p_session: sessionId(b.session) })), false);
    assert.equal(good(await admin.rpc("consume_withdrawal_email_check", { ...codeCheck, p_proof: "incorrect" })), false);
    assert.equal(good(await admin.rpc("consume_withdrawal_email_check", codeCheck)), true);
    assert.equal(good(await admin.rpc("consume_withdrawal_email_check", codeCheck)), false);
    const [group] = good(await a.database.rpc("create_shopping_group", { p_name: "Shared withdrawal fixture" }));
    const [invite] = good(await a.database.rpc("issue_shopping_invitation", { p_group_id: group.id, p_email: b.email }));
    good(await b.database.rpc("accept_shopping_invitation", { p_invite_id: invite.id }));
    const tokenHeaders = { Authorization: "Bearer " + a.session.access_token };
    const blocked = await call({ action: "preview" }, tokenHeaders);
    assert.equal(blocked.data.groups[0].otherMembers, 1);
    assert.equal((await call({ action: "begin", groups: blocked.data.groups, password: a.password }, tokenHeaders)).status, 409);
    good(await a.database.rpc("offer_shopping_group_transfer", { p_group_id: group.id, p_recipient: b.id }));
    const [offer] = good(await b.database.rpc("shopping_group_transfer_status", { p_group_id: group.id }));
    assert.ok((await a.database.rpc("accept_shopping_group_transfer", {
      p_group_id: group.id, p_expires_at: offer.expires_at,
    })).error);
    const [owned] = good(await b.database.rpc("create_shopping_group", { p_name: "Occupied ownership slot" }));
    const capped = await b.database.rpc("accept_shopping_group_transfer", { p_group_id: group.id, p_expires_at: offer.expires_at });
    assert.equal(capped.error?.message, "TRANSFER_OWNED_GROUP_LIMIT");
    good(await b.database.rpc("delete_empty_shopping_group", { p_group_id: owned.id }));
    good(await b.database.rpc("accept_shopping_group_transfer", { p_group_id: group.id, p_expires_at: offer.expires_at }));

    const existingBucket = await admin.storage.getBucket("item-images");
    if (existingBucket.error) good(await admin.storage.createBucket("item-images", { public: true }));
    const file = a.id + "/shared.png";
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+mgTkAAAAASUVORK5CYII=", "base64");
    good(await a.database.storage.from("item-images").upload(file, png, { contentType: "image/png" }));
    const imageUrl = a.database.storage.from("item-images").getPublicUrl(file).data.publicUrl;
    good(await a.database.from("shopping_items").insert({ user_id: a.id, group_id: group.id, name: "Shared image", image_url: imageUrl }));
    good(await a.database.from("deleted_items").insert({ user_id: a.id, group_id: group.id, name: "Shared history", purchased_by_name: a.email }));
    good(await a.database.from("user_item_master").insert({ user_id: a.id, name: "Private item" }));
    const recipe = good(await a.database.from("recipes").insert({ user_id: a.id, name: "Private recipe" }).select().single());
    const plan = good(await a.database.from("meal_plans").insert({
      user_id: a.id, group_id: group.id, name: "Shared dinner", start_date: "2026-11-23", end_date: "2026-11-29",
    }).select().single());
    good(await a.database.from("meal_plan_entries").insert({
      meal_plan_id: plan.id, meal_date: "2026-11-23", title: "Retained recipe title", recipe_id: recipe.id,
    }));

    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext();
    await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), a.session);
    let allowProgress = false;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (![api, origin].includes(url.origin)) return route.abort();
      if (url.pathname === "/api/delete-user" && request.postDataJSON()?.action === "status" && !allowProgress) {
        return route.fulfill({ json: { stage: "pending" } });
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(origin + "/profile");
    await page.getByRole("button", { name: "退会手続き" }).click();
    await page.getByLabel("現在のパスワード").fill(a.password);
    await page.getByRole("checkbox", { name: "表示された削除対象を確認し、退会に同意します。" }).check();
    const acceptance = page.waitForResponse((response) => response.url().endsWith("/api/delete-user") && response.status() === 202);
    await page.getByRole("button", { name: "確認して退会する" }).click();
    const { id } = await (await acceptance).json();
    await page.getByText("退会を受け付けました。", { exact: false }).waitFor();

    const denied = await a.database.from("shopping_items").insert({ user_id: a.id, group_id: group.id, name: "Forbidden" });
    assert.equal(denied.error?.code, "42501");
    assert.ok((await a.database.storage.from("item-images").upload(a.id + "/forbidden.png", png)).error);
    assert.deepEqual(good(await a.database.from("shopping_items").select("id").eq("group_id", group.id)), []);
    assert.equal((await call({ action: "worker" })).status, 401);
    const lease = randomUUID();
    assert.equal(good(await admin.rpc("claim_account_withdrawal", { p_job: id, p_lease: lease })).stage, "storage");
    assert.equal(good(await admin.rpc("claim_account_withdrawal", { p_job: id, p_lease: randomUUID() })), null);
    assert.equal(good(await admin.rpc("advance_account_withdrawal", {
      p_job: id, p_lease: randomUUID(), p_action: "storage_done",
    })), false);
    assert.equal(good(await admin.rpc("advance_account_withdrawal", {
      p_job: id, p_lease: lease, p_action: "release",
    })), true);
    if (process.env.WITHDRAWAL_ARCHIVED_CRON_TEST === "true") {
      relay = spawn("docker", ["exec", "-i", project + "-storage-1", "node", "-e",
      `(${cronRelay.toString()})(${JSON.stringify(worker)})`], { stdio: ["pipe", "pipe", "ignore"] });
    const ready = new Promise((resolve) => {
      createInterface({ input: relay.stdout }).on("line", async (line) => {
        const event = JSON.parse(line);
        if (event.pid) {
          relayPid = String(event.pid);
          resolve();
          return;
        }
        cronCalls++;
        const result = await call({ action: "worker" }, { "x-withdrawal-worker": worker })
          .catch(() => ({ status: 503 }));
        if (relay.stdin.writable) relay.stdin.write(JSON.stringify({ id: event.id, status: result.status }) + "\n");
      });
    });
    await Promise.race([ready, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Cron relay did not start")), 10000);
      timer.unref();
    })]);
    cronRegistered = true;
    sql(`SELECT vault.create_secret('${worker}', 'account_withdrawal_worker_secret');
      SELECT cron.schedule('account-withdrawal-real-worker-test', '5 seconds',
        $$SELECT app_private.dispatch_account_withdrawal('http://storage:35540/api/delete-user')$$);`);
    const deadline = Date.now() + 55000;
    while (!mail.some((message) => message.to === a.email) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(sql(`SELECT public.account_withdrawal_status('${id}')`), "complete");
    assert.ok(cronCalls >= 4);
    assert.equal(mail.filter((message) => message.to === a.email).length, 1);
    sql(`SELECT cron.unschedule('account-withdrawal-real-worker-test');
      DELETE FROM vault.secrets WHERE name = 'account_withdrawal_worker_secret';`);
      cronRegistered = false;
    } else {
      for (let attempt = 0; attempt < 6 && !mail.some(message => message.to === a.email); attempt++) {
        assert.equal((await call({ action: "worker" }, { "x-withdrawal-worker": worker })).status, 200);
      }
      assert.equal(sql(`SELECT public.account_withdrawal_status('${id}')`), "complete");
      assert.equal(mail.filter((message) => message.to === a.email).length, 1);
    }
    allowProgress = true;
    await page.getByText("退会処理が完了しました。", { exact: true }).waitFor({ timeout: 45000 });
    assert.equal((await call({ action: "status", id })).data.stage, "complete");
    assert.equal(mail.filter((message) => message.to === a.email).length, 1);
    assert.ok((await admin.auth.admin.getUserById(a.id)).error);
    const recreated = await fetch(api + "/auth/v1/admin/users", {
      method: "POST", headers: { Authorization: "Bearer " + service, "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, email: a.email, password: randomUUID(), email_confirm: true }),
    });
    assert.equal(recreated.ok, true);
    assert.equal((await recreated.json()).id, a.id);
    assert.equal((await call({ action: "preview" }, tokenHeaders)).status, 401);
    good(await admin.auth.admin.deleteUser(a.id));
    const history = good(await b.database.from("deleted_items").select("user_id,purchased_by_name").eq("group_id", group.id).single());
    assert.deepEqual(history, { user_id: null, purchased_by_name: "退会済みユーザー" });
    const shared = good(await b.database.from("shopping_items").select("image_url,user_id").eq("group_id", group.id).single());
    assert.equal(shared.user_id, null);
    assert.notEqual(shared.image_url, imageUrl);
    assert.deepEqual(Buffer.from(await (await fetch(shared.image_url, { redirect: "error" })).arrayBuffer()), png);
    const entry = good(await b.database.from("meal_plan_entries").select("title,recipe_id").eq("meal_plan_id", plan.id).single());
    assert.deepEqual(entry, { title: "Retained recipe title", recipe_id: null });
    assert.equal(good(await b.database.from("meal_plans").select("user_id").eq("id", plan.id).single()).user_id, b.id);

    // The same group now has one member, with data. Normal group deletion is
    // still rejected. A stale confirmation must not remove newer records.
    const bHeaders = { Authorization: "Bearer " + b.session.access_token };
    assert.equal((await b.database.rpc("delete_empty_shopping_group", { p_group_id: group.id })).error?.code, "23514");
    const stale = await call({ action: "preview" }, bHeaders);
    good(await b.database.from("shopping_items").insert({ user_id: b.id, group_id: group.id, name: "New since confirmation" }));
    assert.equal((await call({ action: "begin", groups: stale.data.groups, password: b.password }, bHeaders)).status, 409);
    const fresh = await call({ action: "preview" }, bHeaders);
    const starts = await Promise.all([0, 1].map(() =>
      call({ action: "begin", groups: fresh.data.groups, password: b.password }, bHeaders)));
    assert.deepEqual(starts.map((result) => result.status), [202, 202]);
    assert.equal(starts[0].data.id, starts[1].data.id);
    const secondId = starts[0].data.id;
    for (let attempt = 0; attempt < 6; attempt++) {
      assert.equal((await call({ action: "worker" }, { "x-withdrawal-worker": worker })).status, 200);
    }
    assert.equal((await call({ action: "status", id: secondId })).data.stage, "complete");
    assert.equal(mail.filter((message) => message.to === b.email).length, 1);
    assert.ok((await admin.auth.admin.getUserById(b.id)).error);
    assert.equal((await fetch(shared.image_url, { redirect: "error" })).ok, false);
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (cronRegistered) sql(`SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='account-withdrawal-real-worker-test';
      DELETE FROM vault.secrets WHERE name='account_withdrawal_worker_secret';`);
    if (relayPid) execFileSync("docker", ["exec", project + "-storage-1", "kill", relayPid], { stdio: "ignore" });
    relay?.kill();
    if (browser) await browser.close();
    if (process.platform === "win32" && server.pid) {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else server.kill();
    mailbox.closeAllConnections();
    mailbox.close();
  }
});
