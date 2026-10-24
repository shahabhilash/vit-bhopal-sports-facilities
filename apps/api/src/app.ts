import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { ApiError, type ApiErrorBody } from "@vitb/shared";
import type { Config } from "./config";
import type { TokenVerifier } from "./lib/auth";
import type { DataSource } from "./lib/data";
import {
  type AppEnv,
  corsPolicy,
  rateLimit,
  requestContext,
  requireAuth,
  securityHeaders,
} from "./middleware";

export interface AppDeps {
  config: Config;
  verifyToken: TokenVerifier;
  data: DataSource;
}

export function createApp({ config, verifyToken, data }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", requestContext(config.TRUST_PROXY_HOPS));
  app.use("*", securityHeaders(config.APP_ENV === "production"));
  app.use("*", corsPolicy(config));
  app.use(
    "*",
    bodyLimit({
      maxSize: config.BODY_LIMIT_BYTES,
      onError: () => {
        throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large.");
      },
    }),
  );
  app.use("*", rateLimit({ limit: config.RATE_LIMIT_PER_MINUTE * 2, key: (c) => `ip:${c.get("clientIp")}` }));

  app.get("/health", (c) => c.json({ status: "ok" }));

  const v1 = new Hono<AppEnv>();
  v1.use("*", requireAuth(verifyToken));
  v1.use("*", rateLimit({ limit: config.RATE_LIMIT_PER_MINUTE, key: (c) => `user:${c.get("user").id}` }));

  v1.get("/me", async (c) => {
    const user = c.get("user");
    const [profile, roles] = await Promise.all([data.getProfile(user), data.getRoles(user)]);
    if (!profile) throw new ApiError("NOT_FOUND", "Your profile has not been created yet. Please sign in again.");
    return c.json({ ...profile, roles });
  });

  app.route("/v1", v1);

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Not found.", c.get("requestId")), 404));

  app.onError((err, c) => {
    const requestId = c.get("requestId") ?? "unknown";
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message, requestId, err.details), err.status as 400);
    }
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(errorBody("VALIDATION_FAILED", "The request could not be processed.", requestId), err.status);
    }
    // Log the type and message only; never the request headers or body.
    console.error(JSON.stringify({ requestId, error: err.name, message: err.message }));
    return c.json(errorBody("INTERNAL", "Something went wrong on our side. Please try again.", requestId), 500);
  });

  return app;
}

function errorBody(code: ApiErrorBody["error"]["code"], message: string, requestId: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
