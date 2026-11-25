import { timingSafeEqual } from "node:crypto";

export function hasValidDatabaseConnectionKey(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}
