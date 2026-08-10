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
