/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const ADMIN_UPSTREAM_ORIGIN = "https://weather.ashlxylock.uk";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function removeHopByHopHeaders(headers: Headers): void {
  const connectionTokens = (headers.get("connection") ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const header of [...HOP_BY_HOP_HEADERS, ...connectionTokens]) {
    headers.delete(header);
  }
}

async function proxyAdminRequest(request: Request): Promise<Response> {
  const publicUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${publicUrl.pathname}${publicUrl.search}`,
    ADMIN_UPSTREAM_ORIGIN,
  );
  const upstreamRequest = new Request(upstreamUrl, request);

  removeHopByHopHeaders(upstreamRequest.headers);
  // The website is not a device credential broker. Even a caller-supplied
  // token is removed before the request reaches the administrator surface.
  upstreamRequest.headers.delete("authorization");
  upstreamRequest.headers.delete("x-device-token");
  for (const header of [...upstreamRequest.headers.keys()]) {
    if (header === "forwarded" || header.startsWith("x-forwarded-")) {
      upstreamRequest.headers.delete(header);
    }
  }
  upstreamRequest.headers.set("x-forwarded-host", publicUrl.host);
  upstreamRequest.headers.set("x-forwarded-proto", publicUrl.protocol.slice(0, -1));

  try {
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);
    removeHopByHopHeaders(responseHeaders);
    responseHeaders.set("cache-control", "no-store");

    const location = responseHeaders.get("location");
    if (location) {
      const redirectUrl = new URL(location, ADMIN_UPSTREAM_ORIGIN);
      if (
        redirectUrl.origin === ADMIN_UPSTREAM_ORIGIN &&
        isAdminPath(redirectUrl.pathname)
      ) {
        responseHeaders.set(
          "location",
          `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`,
        );
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return new Response("CoastWatch admin console is temporarily unavailable.", {
      status: 502,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (isAdminPath(url.pathname)) {
      return proxyAdminRequest(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
