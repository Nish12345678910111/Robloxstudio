import { createHash, timingSafeEqual } from "node:crypto";
import { dbConfigured } from "../_lib/auth.js";
import { getPhoneRowById } from "../_lib/db.js";
import { json } from "../_lib/http.js";
import { Buffer } from "node:buffer";

export async function onRequestGet({ request, env }) {
  const run = { action: "run" };
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    const token = request.headers.get("x-phone-token") || "";
    if (!dbConfigured(env) || !id) return json(run);
    let row;
    try { row = await getPhoneRowById(id, env); } catch { return json(run); }
    if (!row || ["deleting", "deleted"].includes(row.status)) return json({ action: "stop" });
    if (!row.phone_password || !token) return json(run);
    const expected = createHash("sha256").update(row.phone_password).digest();
    const supplied = Buffer.from(token, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(run);
    return json(run);
  } catch { return json(run); } // Fail open: an API hiccup never kills a phone.
}
