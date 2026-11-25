const safeText = value => String(value || "")
  .replace(/postgres(?:ql)?:\/\/[^\s\"'<>]+/gi, "[redacted database URL]")
  .replace(/\b(password|passwd|token|authorization)\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gi, "[redacted token]")
  .replace(/\s+/g, " ").trim().slice(0, 200);

const safeField = (value, fallback = "unknown") => String(value ?? fallback)
  .replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 60);

function errorChain(error) {
  const chain = [], seen = new Set();
  let current = error;
  for (let i = 0; current && i < 4 && !seen.has(current); i++) {
    if (typeof current !== "object") break;
    seen.add(current);
    chain.push(current);
    current = current.cause || current.originalError || current.original || current.parent;
  }
  return chain;
}

function findCode(chain) {
  for (let i = 0; i < chain.length; i++) {
    const code = chain[i].code;
    if (code != null && String(code).trim() && String(code).toLowerCase() !== "unknown") {
      return { value: String(code), source: i === 0 ? "driver" : "cause" };
    }
  }
  for (let i = 0; i < chain.length; i++) {
    if (chain[i].errno != null && String(chain[i].errno).trim()) {
      return { value: String(chain[i].errno), source: i === 0 ? "errno" : "cause-errno" };
    }
  }
  return null;
}

function classify(code, message) {
  const c = String(code || "").toUpperCase();
  const m = String(message || "").toLowerCase();
  if (c === "53300" || /too many clients|remaining connection slots/.test(m)) return "PG_TOO_MANY_CONNECTIONS";
  if (["57P01", "57P02", "57P03"].includes(c)) return "PG_SERVER_SHUTDOWN";
  if (/^[0-9A-Z]{5}$/.test(c) && c.startsWith("08")) return "PG_CONNECTION_EXCEPTION";
  if (/^[0-9A-Z]{5}$/.test(c) && c.startsWith("53")) return "PG_INSUFFICIENT_RESOURCES";
  if (["ECONNRESET", "EPIPE"].includes(c) || /connection reset|socket hang up/.test(m)) return "PG_SOCKET_RESET";
  if (["ETIMEDOUT", "ETIME"].includes(c) || /timed? ?out|timeout/.test(m)) return "PG_CONNECTION_TIMEOUT";
  if (c === "ECONNREFUSED") return "PG_CONNECTION_REFUSED";
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") return "PG_DNS_FAILURE";
  if (/proxy request failed|cannot connect to the specified address/.test(m)) return "PG_TCP_PROXY_CONNECT_FAILED";
  if (/connection terminated unexpectedly|server closed the connection/.test(m)) return "PG_CONNECTION_TERMINATED";
  if (/out of memory|oom|memory limit/.test(m)) return "PG_OUT_OF_MEMORY";
  if (/password authentication failed|authentication failed/.test(m)) return "PG_AUTHENTICATION_FAILED";
  if (/certificate|\bssl\b|\btls\b/.test(m)) return "PG_TLS_ERROR";
  if (/^[0-9A-Z]{5}$/.test(c)) return "POSTGRESQL_ERROR";
  return "DATABASE_ERROR";
}

export function safeDatabaseErrorDetails(error) {
  const chain = errorChain(error);
  const root = chain[0];
  const codeInfo = findCode(chain);
  const rootMessage = safeText(root?.message) || "No error message provided";
  const classification = classify(codeInfo?.value, rootMessage);
  const codeIsSqlState = Boolean(codeInfo && /^[0-9A-Z]{5}$/i.test(codeInfo.value));
  const details = {
    name: safeField(root?.name || "Error"),
    code: codeInfo ? safeField(codeInfo.value) : classification,
    codeKind: codeInfo ? (codeIsSqlState ? "sqlstate" : codeInfo.source) : "classification",
    classification,
    message: rootMessage,
  };
  if (!codeInfo) details.driverCode = "not-provided";
  if (codeIsSqlState) details.sqlState = safeField(codeInfo.value);
  const errno = chain.find(item => item.errno != null)?.errno;
  const syscall = chain.find(item => item.syscall)?.syscall;
  if (errno != null) details.errno = safeField(errno);
  if (syscall) details.syscall = safeField(syscall);
  const causeMessage = chain.slice(1).map(item => safeText(item.message)).find(Boolean);
  if (causeMessage) details.cause = causeMessage;
  return details;
}
