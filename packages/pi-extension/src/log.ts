import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { floorFor, JudgeError, type Judgment, qualifies, score } from "./judge.ts";

import type { JudgeProfile } from "./profile.ts";

export const REQUEST_LOG_NAME = "compact-adviser-requests.jsonl";
export const AUDIT_LOG_PREFIX = "compact-adviser-audit";

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "") || "session";
}

export function requestLogPath(agentDir: string): string {
  return join(agentDir, REQUEST_LOG_NAME);
}

export function auditLogPath(agentDir: string, sessionId: string): string {
  return join(agentDir, `${AUDIT_LOG_PREFIX}-${safeSessionId(sessionId)}.jsonl`);
}

/** Stable correlation id for a request body. FNV-1a 64 so Claude Code hooks need no Node crypto. */
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

function writeLog(agentDir: string, line: string): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  appendFileSync(requestLogPath(agentDir), line, { mode: 0o600 });
}

export function appendRequestLog(agentDir: string, body: string): void {
  writeLog(agentDir, requestLogLine(body));
}

export function appendResponseLog(
  agentDir: string,
  body: string,
  judgment: Judgment,
  usage: number,
  profile?: JudgeProfile,
): void {
  writeLog(agentDir, responseLogLine(body, judgment, usage, undefined, profile));
}

export function appendErrorLog(agentDir: string, error: unknown, body?: string): void {
  writeLog(agentDir, errorLogLine(loggedJudgeErrorKind(error), body));
}

export function appendAuditLog(agentDir: string, sessionId: string, line: string): void {
  mkdirSync(agentDir, { recursive: true, mode: 0o700 });
  appendFileSync(auditLogPath(agentDir, sessionId), line, { mode: 0o600 });
}
