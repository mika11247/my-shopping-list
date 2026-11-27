const assert = require("node:assert/strict");
const { createHmac, randomUUID } = require("node:crypto");
const { test } = require("node:test");

const insideDocker = process.argv.includes("--isolated-docker");
const auth = insideDocker ? "http://auth:9999" : "http://127.0.0.1:35539/auth/v1";
const storage = insideDocker ? "http://storage:5000" : "http://127.0.0.1:35539/storage/v1";
const bucket = "item-images";
const secret = "withdrawal-isolated-test-signing-secret";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const unsigned = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({
  role: "service_role",
  exp: Math.floor(Date.now() / 1000) + 600,
});
const admin = unsigned + "." + createHmac("sha256", secret).update(unsigned).digest("base64url");

async function request(origin, path, method, token, body, type = "application/json") {
  const response = await fetch(origin + path, {
    method,
    redirect: "error",
    headers: {
      Authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "Content-Type": type }),
    },
    body: body === undefined || type !== "application/json" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  assert.ok(response.ok, `${method} ${path} returned ${response.status}: ${text}`);
  return text;
}

test("a service-owned copy remains readable after deleting the original uploader", async () => {
  const email = randomUUID() + "@example.test";
  const password = randomUUID();
  const user = JSON.parse(await request(auth, "/admin/users", "POST", admin, {
    email, password, email_confirm: true,
  }));
  const { access_token: token } = JSON.parse(await request(auth, "/token?grant_type=password", "POST", admin, {
    email, password,
  }));
  const buckets = JSON.parse(await request(storage, "/bucket", "GET", admin));
  if (!buckets.some(({ id }) => id === bucket)) {
    await request(storage, "/bucket", "POST", admin, { id: bucket, name: bucket, public: true });
  }
  const original = user.id + "/fixture.txt";
  const replacement = "retained/" + randomUUID();
  const content = "synthetic shared image payload";
  // Use the same owner/path checks as the application.
  await request(storage, `/object/${bucket}/${original}`, "POST", token, content, "text/plain");
  await request(storage, "/object/copy", "POST", admin, {
    bucketId: bucket, sourceKey: original, destinationKey: replacement,
  });
  assert.equal(await request(storage, `/object/public/${bucket}/${replacement}`, "GET", admin), content);
  await request(storage, `/object/${bucket}/${original}`, "DELETE", admin);
  await request(auth, `/admin/users/${user.id}`, "DELETE", admin);
  assert.equal(await request(storage, `/object/public/${bucket}/${replacement}`, "GET", admin), content);
  await request(storage, `/object/${bucket}/${replacement}`, "DELETE", admin);
});
