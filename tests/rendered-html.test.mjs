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

test("server-renders the simplified Great Yarmouth study", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Study of coastal risk related data in Great Yarmouth, England<\/title>/i);
  assert.match(html, /COASTWATCH/);
  assert.match(html, /The Study of coastal risk related data in Great Yarmouth, England\./);
  assert.match(html, /Coastline of Great Yarmouth/);
  assert.match(html, /LIVE OPEN-METEO MODEL/);
  assert.match(html, /CURRENT SAFE PROBABILITY/);
  assert.match(html, /ALGORITHM EVALUATION/);
  assert.match(html, /TRUE POSITIVE/);
  assert.match(html, /PRECISION · UNSAFE/);
  assert.match(html, /SINGLE-SITE BASELINE/);
  assert.match(html, /No rule baseline yet/);
  assert.match(html, /not calibrated disaster probabilities/i);
  assert.match(html, /href="\/admin\/login"/);
  assert.match(html, />CONSOLE<\/a>/);
  assert.match(html, /RESEARCH PROTOTYPE · NOT AN OFFICIAL PUBLIC WARNING/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("uses live Open-Meteo inputs without restoring the location selector or mock fallback", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await access(new URL("../public/og-coastwatch.png", import.meta.url));

  const [page, layout, globals, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MODEL_META/);
  assert.match(page, /predictRisk/);
  assert.match(page, /fetchEnvironment/);
  assert.match(page, /marine-api\.open-meteo\.com/);
  assert.match(page, /Great Yarmouth/);
  assert.doesNotMatch(page, /<select|coast-select|fallback:/);
  assert.match(globals, /font-family: "Times New Roman", Times, serif/);
  assert.match(globals, /--bg: #ffffff/);
  assert.match(layout, /og-coastwatch\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships the non-synthetic Great Yarmouth dataset and matching exploratory model artifact", async () => {
  const [csv, warnings, metadataText, modelText, generatedModel] = await Promise.all([
    readFile(new URL("../data/great-yarmouth-coastal-training.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/great-yarmouth-warning-events.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/great-yarmouth-dataset-metadata.json", import.meta.url), "utf8"),
    readFile(new URL("../data/great-yarmouth-logistic-model.json", import.meta.url), "utf8"),
    readFile(new URL("../app/trained-model.ts", import.meta.url), "utf8"),
  ]);
  const metadata = JSON.parse(metadataText);
  const model = JSON.parse(modelText);
  const rows = csv.trimEnd().split("\n");

  assert.equal(metadata.contains_synthetic_data, false);
  assert.equal(metadata.location.name, "Great Yarmouth");
  assert.equal(rows.length - 1, metadata.rows);
  assert.match(rows[0], /temperature_2m_c,relative_humidity_2m_percent,precipitation_mm,rain_mm/);
  assert.match(rows[0], /wave_height_m,wave_period_s,sea_level_height_msl_m,sea_surface_temperature_c/);
  assert.match(csv, /,unsafe\r?$/m);
  assert.match(csv, /,safe\r?$/m);
  assert.equal(warnings.trimEnd().split("\n").length - 1, metadata.warning_events);
  assert.equal(model.model, "Binary Logistic Regression");
  assert.deepEqual(Object.keys(model.label_counts).sort(), ["safe", "unsafe"]);
  assert.equal(model.feature_names.length, model.coefficients.length);
  assert.equal(model.test_confusion_matrix.flat().reduce((sum, value) => sum + value, 0), model.splits.test_2026.rows);
  assert.ok(model.decision_threshold >= 0.75);
  assert.equal(model.splits.validation_2025.rows, 8442);
  assert.equal(model.test_confusion_matrix[1].reduce((sum, value) => sum + value, 0), model.splits.test_2026.labels.unsafe);
  assert.match(generatedModel, new RegExp(model.version));
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
