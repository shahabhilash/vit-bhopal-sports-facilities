import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  ApiError,
  availabilityQuerySchema,
  createBookingSchema,
  updateProfileSchema,
  type ApiErrorBody,
  type AvailabilityEntry,
  type BookingDto,
  type ProfileDto,
  type ResourceDto,
} from "@vitb/shared";
import type { Config } from "./config";
import type { TokenVerifier } from "./lib/auth";
import type { Db } from "./lib/data";
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
  db: Db;
}

function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Some of the details are missing or invalid.",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

async function jsonBody(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "The request body must be JSON.");
  }
}

const uuid = z.uuid();

export function createApp({ config, verifyToken, db }: AppDeps) {
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

  // Public reads: facility configuration and taken/blocked slots (no personal data).
  app.get("/v1/facilities", async (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(await db.rpc<ResourceDto[]>("list_resources", {}, null));
  });

  app.get("/v1/availability", async (c) => {
    const q = validate(availabilityQuerySchema, c.req.query());
    const entries = await db.rpc<AvailabilityEntry[]>(
      "get_availability",
      { p_facility: q.facility, p_from: q.from, p_to: q.to },
      null,
    );
    return c.json(entries);
  });

  // Signed-in routes.
  const auth = requireAuth(verifyToken);
  const perUser = rateLimit({ limit: config.RATE_LIMIT_PER_MINUTE, key: (c) => `user:${c.get("user").id}` });
  const signedIn = [auth, perUser] as const;

  app.get("/v1/me", ...signedIn, async (c) => {
    const me = await db.rpc<ProfileDto | null>("my_profile", {}, c.get("user"));
    if (!me) throw new ApiError("NOT_FOUND", "Your profile has not been created yet. Please sign in again.");
    return c.json(me);
  });

  app.patch("/v1/me", ...signedIn, async (c) => {
    const input = validate(updateProfileSchema, await jsonBody(c));
    const user = c.get("user");
    await db.rpc("update_my_profile", { p_full_name: input.fullName ?? null, p_reg_no: input.regNo ?? null }, user);
    return c.json(await db.rpc<ProfileDto>("my_profile", {}, user));
  });

  app.get("/v1/bookings", ...signedIn, async (c) => {
    return c.json(await db.rpc<BookingDto[]>("my_bookings", {}, c.get("user")));
  });

  app.post("/v1/bookings", ...signedIn, async (c) => {
    const key = c.req.header("idempotency-key") ?? "";
    if (!uuid.safeParse(key).success) {
      throw new ApiError("VALIDATION_FAILED", "Send an Idempotency-Key header containing a UUID.");
    }
    const input = validate(createBookingSchema, await jsonBody(c));
    const booking = await db.rpc<BookingDto>(
      "create_booking",
      {
        p_resource_id: input.resourceId,
        p_slot_date: input.date,
        p_slot_index: input.slotIndex,
        p_participant_count: input.participantCount ?? null,
        p_participant_reg_nos: input.participantRegNos ?? null,
        p_idempotency_key: key,
      },
      c.get("user"),
    );
    return c.json(booking, 201);
  });

  app.post("/v1/bookings/:id/cancel", ...signedIn, async (c) => {
    const id = c.req.param("id");
    if (!uuid.safeParse(id).success) throw new ApiError("NOT_FOUND", "Booking not found.");
    return c.json(await db.rpc<BookingDto>("cancel_booking", { p_booking_id: id }, c.get("user")));
  });

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
