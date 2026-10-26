/** Cloudflare Worker entry point for Cmine Fit. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleApi } from "./api";
import type { WorkerEnv } from "./platform";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function mobileAssociation(request: Request, env: WorkerEnv): Response | null {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET") return null;
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" };
  if (pathname === "/.well-known/apple-app-site-association") {
    if (!env.APPLE_APP_TEAM_ID) return Response.json({ error: "MOBILE_LINK_NOT_CONFIGURED" }, { status: 404 });
    return Response.json({ applinks: { apps: [], details: [{ appID: `${env.APPLE_APP_TEAM_ID}.com.chwjh.cminefit`, paths: ["/auth/mobile/callback"] }] } }, { headers });
  }
  if (pathname === "/.well-known/assetlinks.json") {
    if (!env.ANDROID_APP_SHA256_CERT_FINGERPRINT) return Response.json({ error: "MOBILE_LINK_NOT_CONFIGURED" }, { status: 404 });
    return Response.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.chwjh.cminefit", sha256_cert_fingerprints: [env.ANDROID_APP_SHA256_CERT_FINGERPRINT] } }], { headers });
  }
  return null;
}

const worker = {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      const association = mobileAssociation(request, env);
      if (association) return association;
      const apiResponse = await handleApi(request, env, ctx);
      if (apiResponse) return apiResponse;
    } catch (error) {
      console.error("api_unhandled_error", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "INTERNAL_ERROR", message: "服务端暂时无法完成请求。" }, { status: 500, headers: { "cache-control": "no-store" } });
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
