const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { readFileSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const workflow = readFileSync(join(__dirname, "../.github/workflows/account-withdrawal-worker.yml"), "utf8");
const script = workflow.split("        run: |")[1].trimEnd().split(/\r?\n/).map(line => line.slice(10)).join("\n");
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const secret = "a1".repeat(32);

test("worker schedule and manual dispatch share a default-off main-only gate", () => {
  assert.match(workflow, /cron: "2-57\/5 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /false &&/);
  assert.match(workflow, /github\.repository == 'mika11247\/my-shopping-list'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /vars\.ACCOUNT_WITHDRAWAL_WORKER_ENABLED == 'true'/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("worker HTTP request keeps secrets out of arguments and logs and fails on non-2xx", () => {
  const dir = mkdtempSync(join(tmpdir(), "withdrawal-action-"));
  writeFileSync(join(dir, "runner.sh"), `curl() {
    local header
    read -r header
    [[ "$header" == "x-withdrawal-worker: $WITHDRAWAL_WORKER_SECRET" ]] || exit 90
    [[ "$*" != *"$WITHDRAWAL_WORKER_SECRET"* && "$*" != *--location* ]] || exit 91
    [[ "$*" == *'--header @-'* && "$*" == *'--proto =https'* ]] || exit 92
    [[ "$*" == *'Origin: https://my-shopping-list-vxll.vercel.app'* ]] || exit 94
    [[ "${"$"}{@: -1}" == 'https://my-shopping-list-vxll.vercel.app/api/delete-user' ]] || exit 93
    if [[ "$FIXTURE_STATUS" == transport ]]; then exit 7; fi
    printf '%s' "$FIXTURE_STATUS"
  }
  ${script}
  `);
  for (const [status, credential, expected] of [["200", secret, 0], ["403", secret, 1],
    ["302", secret, 1], ["503", secret, 1], ["transport", secret, 1], ["200", "", 1]]) {
    const run = spawnSync(bash, ["runner.sh"], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, FIXTURE_STATUS: status, WITHDRAWAL_WORKER_SECRET: credential },
    });
    assert.equal(run.status, expected, run.error?.message ?? run.stderr);
    assert.ok(!run.stdout.includes(secret) && !run.stderr.includes(secret));
  }
});
