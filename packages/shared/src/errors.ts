export const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  EMAIL_DOMAIN_NOT_ALLOWED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  SLOT_TAKEN: 409,
  BOOKING_WINDOW_CLOSED: 409,
  FACILITY_BLOCKED: 409,
  LIMIT_REACHED: 409,
  PARTICIPANT_CONFLICT: 409,
  INVALID_STATE: 409,
  PROFILE_INCOMPLETE: 409,
  OFFER_EXPIRED: 409,
  BLOCK_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Every non-2xx API response has exactly this shape. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}
