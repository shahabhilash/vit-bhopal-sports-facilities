import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  ApiError,
  MAX_PHOTO_BYTES,
  adminBookingsQuerySchema,
  adminCancelSchema,
  analyticsQuerySchema,
  availabilityQuerySchema,
  blockPreviewSchema,
  checkOutSchema,
  createBookingSchema,
  feedbackQuerySchema,
  feedbackStatusSchema,
  guardScanSchema,
  joinWaitlistSchema,
  saveBlockSchema,
  staffRoleSchema,
  updateProfileSchema,
  type AdminBookingDto,
  type AnalyticsDto,
  type ApiErrorBody,
  type BlockDto,
  type BlockOverlapsDto,
  type FeedbackItemDto,
  type StaffMemberDto,
  type AvailabilityEntry,
  type BookingDto,
  type BookingPassDto,
  type GuardScanDto,
  type ProfileDto,
  type ResourceDto,
  type Role,
  type WaitlistEntryDto,
} from "@vitb/shared";
import type { Config } from "./config";
import type { TokenVerifier } from "./lib/auth";
import { mapDbError, type Db } from "./lib/data";
import { photoTooLarge, sniffImage, type PhotoStore } from "./lib/photos";
import {
  type AppEnv,
  corsPolicy,
  createRoleGuard,
  rateLimit,
  requestContext,
  requireAuth,
  securityHeaders,
} from "./middleware";

export interface AppDeps {
  config: Config;
  verifyToken: TokenVerifier;
  db: Db;
  /** Private photo storage; null when the service-role key is not configured. */
  photos: PhotoStore | null;
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

export function createApp({ config, verifyToken, db, photos }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", requestContext(config.TRUST_PROXY_HOPS));
  app.use("*", securityHeaders(config.APP_ENV === "production"));
  app.use("*", corsPolicy(config));
  const tooLarge = (): never => {
    throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large.");
  };
  const defaultLimit = bodyLimit({ maxSize: config.BODY_LIMIT_BYTES, onError: tooLarge });
  // Photo uploads get room for one 5 MB image plus multipart overhead; nothing else does.
  const photoLimit = bodyLimit({ maxSize: MAX_PHOTO_BYTES + 64 * 1024, onError: tooLarge });
  app.use("*", (c, next) =>
    (/^\/v1\/bookings\/[^/]+\/feedback-photo$/.test(c.req.path) ? photoLimit : defaultLimit)(c, next),
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

  const idParam = (c: Context<AppEnv>, what: string) => {
    const id = c.req.param("id") ?? "";
    if (!uuid.safeParse(id).success) throw new ApiError("NOT_FOUND", `${what} not found.`);
    return id;
  };

  app.post("/v1/bookings/:id/cancel", ...signedIn, async (c) => {
    const id = idParam(c, "Booking");
    return c.json(await db.rpc<BookingDto>("cancel_booking", { p_booking_id: id }, c.get("user")));
  });

  app.get("/v1/bookings/:id/pass", ...signedIn, async (c) => {
    const id = idParam(c, "Booking");
    return c.json(await db.rpc<BookingPassDto>("my_booking_pass", { p_booking_id: id }, c.get("user")));
  });

  app.post("/v1/bookings/:id/check-out", ...signedIn, async (c) => {
    const id = idParam(c, "Booking");
    const input = validate(checkOutSchema, await jsonBody(c));
    return c.json(
      await db.rpc<BookingDto>(
        "check_out",
        { p_booking_id: id, p_rating: input.rating, p_description: input.description ?? null },
        c.get("user"),
      ),
    );
  });

  // Waiting list
  app.get("/v1/waitlist", ...signedIn, async (c) => {
    return c.json(await db.rpc<WaitlistEntryDto[]>("my_waitlist", {}, c.get("user")));
  });

  app.post("/v1/waitlist", ...signedIn, async (c) => {
    const input = validate(joinWaitlistSchema, await jsonBody(c));
    const entry = await db.rpc<WaitlistEntryDto>(
      "join_waitlist",
      {
        p_resource_id: input.resourceId,
        p_slot_date: input.date,
        p_slot_index: input.slotIndex,
        p_participant_count: input.participantCount ?? null,
        p_participant_reg_nos: input.participantRegNos ?? null,
      },
      c.get("user"),
    );
    return c.json(entry, 201);
  });

  app.post("/v1/waitlist/:id/accept", ...signedIn, async (c) => {
    const id = idParam(c, "Waiting-list entry");
    const r = await db.rpc<{ accepted: boolean; booking?: BookingDto; error?: { code: string; message: string; detail?: string } }>(
      "accept_offer",
      { p_entry_id: id },
      c.get("user"),
    );
    // A failed acceptance has already moved the offer on; report why.
    if (!r.accepted) throw mapDbError({ code: r.error?.code, message: r.error?.message, detail: r.error?.detail });
    return c.json(r.booking, 201);
  });

  app.post("/v1/waitlist/:id/leave", ...signedIn, async (c) => {
    const id = idParam(c, "Waiting-list entry");
    return c.json(await db.rpc<WaitlistEntryDto>("leave_waitlist", { p_entry_id: id }, c.get("user")));
  });

  // Guard scanner. The database checks the role too; this guard fails fast
  // and keeps the endpoint closed to students.
  const requireRole = createRoleGuard(async (user) =>
    ((await db.rpc<ProfileDto | null>("my_profile", {}, user))?.roles ?? []) as Role[],
  );
  app.post("/v1/guard/check-in", ...signedIn, requireRole("guard", "sports_admin"), async (c) => {
    const { code } = validate(guardScanSchema, await jsonBody(c));
    return c.json(await db.rpc<GuardScanDto>("guard_check_in", { p_code: code }, c.get("user")));
  });

  // Issue photo: the student's own report, within 24 hours of checkout. The
  // file type is decided from its bytes, and the storage path is generated here.
  app.post("/v1/bookings/:id/feedback-photo", ...signedIn, async (c) => {
    const id = idParam(c, "Booking");
    if (!photos) throw new ApiError("SERVICE_UNAVAILABLE", "Photo uploads are not available yet.");
    const user = c.get("user");
    const feedbackId = await db.rpc<string>("feedback_photo_target", { p_booking_id: id }, user);

    let file: unknown;
    try {
      file = (await c.req.parseBody())["photo"];
    } catch {
      throw new ApiError("VALIDATION_FAILED", 'Send the photo as multipart form data in a field named "photo".');
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError("VALIDATION_FAILED", "Choose a photo to upload.");
    }
    if (photoTooLarge(file.size)) throw new ApiError("PAYLOAD_TOO_LARGE", "The photo is larger than 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw new ApiError("VALIDATION_FAILED", "Use a JPEG, PNG or WebP photo.");

    const path = `feedback/${feedbackId}/${crypto.randomUUID()}.${kind.ext}`;
    await photos.put(path, bytes, kind.type);
    try {
      await db.rpc("set_feedback_photo", { p_feedback_id: feedbackId, p_path: path }, user);
    } catch (err) {
      await photos.remove(path).catch(() => undefined);
      throw err;
    }
    return c.json({ ok: true }, 201);
  });

  // ---------------------------------------------------------------------------
  // Sports administrator. The database re-checks the role in every function.
  // ---------------------------------------------------------------------------
  const asAdmin = [...signedIn, requireRole("sports_admin")] as const;

  app.get("/v1/admin/analytics", ...asAdmin, async (c) => {
    const q = validate(analyticsQuerySchema, c.req.query());
    return c.json(await db.rpc<AnalyticsDto>("admin_analytics", { p_from: q.from, p_to: q.to }, c.get("user")));
  });

  app.get("/v1/admin/blocks", ...asAdmin, async (c) => {
    return c.json(await db.rpc<BlockDto[]>("admin_blocks", { p_from: null }, c.get("user")));
  });

  app.post("/v1/admin/blocks/preview", ...asAdmin, async (c) => {
    const b = validate(blockPreviewSchema, await jsonBody(c));
    return c.json(
      await db.rpc<BlockOverlapsDto>(
        "admin_block_overlaps",
        {
          p_facility: b.facility,
          p_resource_id: b.resourceId ?? null,
          p_start: b.startDate,
          p_end: b.endDate,
          p_slots: b.slotIndexes?.length ? b.slotIndexes : null,
          p_exclude: b.excludeId ?? null,
        },
        c.get("user"),
      ),
    );
  });

  const saveBlock = async (c: Context<AppEnv>, blockId: string | null) => {
    const b = validate(saveBlockSchema, await jsonBody(c));
    return db.rpc<{ block: BlockDto; cancelled: number }>(
      "admin_save_block",
      {
        p_block_id: blockId,
        p_facility: b.facility,
        p_resource_id: b.resourceId ?? null,
        p_start: b.startDate,
        p_end: b.endDate,
        p_slots: b.slotIndexes?.length ? b.slotIndexes : null,
        p_reason: b.reason,
        p_note: b.note ?? null,
        p_cancel_affected: b.cancelAffected ?? false,
      },
      c.get("user"),
    );
  };
  app.post("/v1/admin/blocks", ...asAdmin, async (c) => c.json(await saveBlock(c, null), 201));
  app.patch("/v1/admin/blocks/:id", ...asAdmin, async (c) => c.json(await saveBlock(c, idParam(c, "Block"))));
  app.delete("/v1/admin/blocks/:id", ...asAdmin, async (c) => {
    await db.rpc("admin_delete_block", { p_block_id: idParam(c, "Block") }, c.get("user"));
    return c.body(null, 204);
  });

  app.get("/v1/admin/bookings", ...asAdmin, async (c) => {
    const q = validate(adminBookingsQuerySchema, c.req.query());
    return c.json(
      await db.rpc<AdminBookingDto[]>("admin_bookings", { p_date: q.date, p_facility: q.facility ?? null }, c.get("user")),
    );
  });

  app.post("/v1/admin/bookings/:id/cancel", ...asAdmin, async (c) => {
    const id = idParam(c, "Booking");
    const { reason } = validate(adminCancelSchema, await jsonBody(c));
    return c.json(await db.rpc<BookingDto>("admin_cancel_booking", { p_booking_id: id, p_reason: reason }, c.get("user")));
  });

  app.get("/v1/admin/feedback", ...asAdmin, async (c) => {
    const q = validate(feedbackQuerySchema, c.req.query());
    return c.json(
      await db.rpc<{ total: number; items: FeedbackItemDto[] }>(
        "admin_feedback",
        {
          p_status: q.status ?? null,
          p_facility: q.facility ?? null,
          p_rating: q.rating ?? null,
          p_from: q.from ?? null,
          p_to: q.to ?? null,
          p_limit: q.limit ?? 25,
          p_offset: q.offset ?? 0,
        },
        c.get("user"),
      ),
    );
  });

  app.patch("/v1/admin/feedback/:id", ...asAdmin, async (c) => {
    const id = idParam(c, "Feedback");
    const { status } = validate(feedbackStatusSchema, await jsonBody(c));
    await db.rpc("admin_set_feedback_status", { p_feedback_id: id, p_status: status }, c.get("user"));
    return c.body(null, 204);
  });

  // Short-lived signed URL; the bucket itself is private.
  app.get("/v1/admin/feedback/:id/photo", ...asAdmin, async (c) => {
    const id = idParam(c, "Feedback");
    if (!photos) throw new ApiError("SERVICE_UNAVAILABLE", "Photo storage is not configured.");
    const path = await db.rpc<string>("admin_feedback_photo_path", { p_feedback_id: id }, c.get("user"));
    return c.json({ url: await photos.signedUrl(path, 60), expiresIn: 60 });
  });

  app.get("/v1/admin/staff", ...asAdmin, async (c) => {
    return c.json(await db.rpc<StaffMemberDto[]>("admin_staff", {}, c.get("user")));
  });

  app.post("/v1/admin/staff", ...asAdmin, async (c) => {
    const r = validate(staffRoleSchema, await jsonBody(c));
    await db.rpc("admin_set_role", { target_email: r.email, _role: r.role, _grant: r.grant }, c.get("user"));
    return c.json(await db.rpc<StaffMemberDto[]>("admin_staff", {}, c.get("user")));
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
