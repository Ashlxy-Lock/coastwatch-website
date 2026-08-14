import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished CoastWatch machine-learning dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CoastWatch \| 英国海岸机器学习风险研究<\/title>/i);
  assert.match(html, /COASTWATCH/);
  assert.match(html, /英国海岸实时风险研究/);
  assert.match(html, /研究原型/);
  assert.match(html, /机器学习风险评估/);
  assert.match(html, /href="\/admin\/login"/);
  assert.match(html, /管理后台/);
  assert.match(html, /初步模型证据/);
  assert.match(html, /研究原型 · 非官方公共预警/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("retains the finished dashboard interactions and social card", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await access(new URL("../public/og-coastwatch.png", import.meta.url));

  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setLanguage\("en"\)/);
  assert.match(page, /fetchEnvironment/);
  assert.match(page, /MODEL_META/);
  assert.match(layout, /og-coastwatch\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("proxies only the fixed admin prefix without exposing device credentials", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("admin-proxy-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const originalFetch = globalThis.fetch;
  const upstreamRequests = [];

  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    upstreamRequests.push(request);
    return new Response("proxied", {
      status: 200,
      headers: {
        "connection": "x-upstream-hop",
        "set-cookie": "coastwatch_admin_session=signed; HttpOnly; Secure; SameSite=Strict; Path=/",
        "x-upstream-hop": "remove-me",
      },
    });
  };

  try {
    const getResponse = await worker.fetch(
      new Request("https://coastwatch.example/admin/login?return_to=%2Fadmin%2Fconsole", {
        headers: {
          "connection": "x-client-hop",
          "authorization": "Bearer caller-supplied",
          "forwarded": "for=spoofed;host=spoofed.example;proto=http",
          "x-client-hop": "remove-me",
          "x-device-token": "must-not-be-forwarded",
          "x-forwarded-for": "spoofed",
          "x-forwarded-host": "spoofed.example",
          "x-forwarded-proto": "http",
        },
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );

    assert.equal(getResponse.status, 200);
    assert.equal(await getResponse.text(), "proxied");
    assert.match(getResponse.headers.get("set-cookie") ?? "", /coastwatch_admin_session=signed/);
    assert.equal(getResponse.headers.get("cache-control"), "no-store");
    assert.equal(getResponse.headers.get("connection"), null);
    assert.equal(getResponse.headers.get("x-upstream-hop"), null);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(
      upstreamRequests[0].url,
      "https://weather.ashlxylock.uk/admin/login?return_to=%2Fadmin%2Fconsole",
    );
    assert.equal(upstreamRequests[0].headers.get("x-device-token"), null);
    assert.equal(upstreamRequests[0].headers.get("authorization"), null);
    assert.equal(upstreamRequests[0].headers.get("forwarded"), null);
    assert.equal(upstreamRequests[0].headers.get("x-forwarded-for"), null);
    assert.equal(upstreamRequests[0].headers.get("connection"), null);
    assert.equal(upstreamRequests[0].headers.get("x-client-hop"), null);
    assert.equal(upstreamRequests[0].headers.get("x-forwarded-host"), "coastwatch.example");
    assert.equal(upstreamRequests[0].headers.get("x-forwarded-proto"), "https");

    const payload = JSON.stringify({ username: "entered-by-user", password: "entered-by-user" });
    const postResponse = await worker.fetch(
      new Request("https://coastwatch.example/admin/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cookie": "coastwatch_admin_session=browser-cookie",
        },
        body: payload,
      }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );

    assert.equal(postResponse.status, 200);
    assert.equal(upstreamRequests.length, 2);
    assert.equal(upstreamRequests[1].method, "POST");
    assert.equal(upstreamRequests[1].url, "https://weather.ashlxylock.uk/admin/api/auth/login");
    assert.equal(upstreamRequests[1].headers.get("cookie"), "coastwatch_admin_session=browser-cookie");
    assert.equal(await upstreamRequests[1].text(), payload);

    await worker.fetch(
      new Request("https://coastwatch.example/api/v1/auth/login"),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(upstreamRequests.length, 2, "root API paths must never reach the admin upstream");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
