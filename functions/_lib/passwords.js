import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    // Match the existing account hash format and work factor so accounts
    // created on the current service remain valid after moving to Pages.
    scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt$${salt}$${Buffer.from(key).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [, salt, hex] = String(stored).split("$");
    if (!salt || !/^[a-f0-9]{128}$/i.test(hex || "")) return false;
    const expected = Buffer.from(hex, "hex");
    const actual = Buffer.from(await derive(password, salt));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
