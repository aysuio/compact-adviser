import { floorFor, JudgeError, type Judgment, qualifies, score } from "./judge.ts";

export const REQUEST_LOG_PREFIX = "compact-adviser-requests";
export const AUDIT_LOG_PREFIX = "compact-adviser-audit";

export function requestLogName(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "") || "session";
  return `${REQUEST_LOG_PREFIX}-${safe}.jsonl`;
}

export function requestLogPath(home: string, sessionId: string): string {
  const root = home.replace(/[\\/]+$/, "");
  return `${root}/.claude/${requestLogName(sessionId)}`;
}

export function auditLogPath(home: string, sessionId: string): string {
  const root = home.replace(/[\\/]+$/, "");
  const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "") || "session";
  return `${root}/.claude/${AUDIT_LOG_PREFIX}-${safe}.jsonl`;
}

/** Stable correlation id for a request body. FNV-1a 64 so Claude Code hooks need no Node crypto. */
import type { JudgeProfile } from "./profile.ts";

export function requestLogId(body: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(body)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function loggedJudgeErrorKind(error: unknown): string {
  return error instanceof JudgeError ? error.kind : "unavailable";
}

export function requestLogLine(body: string, at = new Date().toISOString()): string {
  return `${JSON.stringify({ at, kind: "request", id: requestLogId(body), body: JSON.parse(body) })}\n`;
}

export function responseLogLine(
  body: string,
  judgment: Judgment,
  usage: number,
  at = new Date().toISOString(),
  profile?: JudgeProfile,
): string {
  return `${JSON.stringify({
    at,
    kind: "response",
    id: requestLogId(body),
    answers: {
      done: { choice: judgment.done.choice, probabilities: judgment.done.probabilities },
      shape: { choice: judgment.shape.choice, probabilities: judgment.shape.probabilities },
    },
    score: score(judgment, profile),
    usage: Number.isFinite(usage) ? usage : null,
    floor: floorFor(usage, profile),
    qualifies: qualifies(judgment, usage, profile),
  })}\n`;
}

export type AuditAction = "keep" | "hint" | "compact_requested" | "suppressed";

export interface AuditContext {
  adapter: "pi" | "claude" | "codex" | "grok";
  sessionId: string;
  checkpointKey: string;
  tokens: number | null;
  window: number | null;
  action: AuditAction;
  reason: string;
}

/** A local, content-free record that proves Jev ran and records the resulting gate action. */
export function auditJudgmentLine(
  context: AuditContext,
  judgment: Judgment,
  usage: number,
  at = new Date().toISOString(),
  profile?: JudgeProfile,
): string {
  return `${JSON.stringify({
    at,
    kind: "judgment",
    adapter: context.adapter,
    sessionId: context.sessionId,
    checkpointKey: context.checkpointKey,
    context: {
      tokens:
        typeof context.tokens === "number" && Number.isFinite(context.tokens)
          ? context.tokens
          : null,
      window:
        typeof context.window === "number" && Number.isFinite(context.window)
          ? context.window
          : null,
      fraction: Number.isFinite(usage) ? usage : null,
    },
    judge: {
      model: judgment.model,
      inputTokens: judgment.inputTokens,
      outputTokens: judgment.outputTokens,
    },
    decision: {
      done: judgment.done.choice,
      shape: judgment.shape.choice,
      score: score(judgment, profile),
      floor: floorFor(usage, profile),
      qualifies: qualifies(judgment, usage, profile),
      action: context.action,
      reason: context.reason,
    },
  })}\n`;
}

export function auditErrorLine(
  context: Omit<AuditContext, "action" | "reason">,
  kind: string,
  at = new Date().toISOString(),
): string {
  return `${JSON.stringify({
    at,
    kind: "error",
    adapter: context.adapter,
    sessionId: context.sessionId,
    checkpointKey: context.checkpointKey,
    context: {
      tokens:
        typeof context.tokens === "number" && Number.isFinite(context.tokens)
          ? context.tokens
          : null,
      window:
        typeof context.window === "number" && Number.isFinite(context.window)
          ? context.window
          : null,
    },
    decision: { action: "error", reason: kind },
  })}\n`;
}

export function errorLogLine(kind: string, body?: string, at = new Date().toISOString()): string {
  return `${JSON.stringify({
    at,
    kind: "error",
    ...(body === undefined ? {} : { id: requestLogId(body) }),
    error: { kind },
  })}\n`;
}
