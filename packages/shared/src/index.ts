export * from "./email";
export * from "./slots";
export * from "./time";
export * from "./facilities";
export * from "./errors";

export const ROLES = ["student", "sports_admin", "guard"] as const;
export type Role = (typeof ROLES)[number];
