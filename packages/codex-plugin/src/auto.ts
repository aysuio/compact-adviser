import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./config.ts";
import { sessionFileName } from "./store.ts";

export const AUTO_REQUESTS_DIRECTORY = "auto-requests";

export interface AutoRequest {
  version: 1;
  sessionId: string;
  checkpointKey: string;
  tokens: number;
  window: number | null;
  createdAt: number;
}

export function autoRequestPath(root: string, sessionId: string): string {
  return join(root, AUTO_REQUESTS_DIRECTORY, sessionFileName(sessionId));
}

export function writeAutoRequest(root: string, request: AutoRequest): void {
  const directory = join(root, AUTO_REQUESTS_DIRECTORY);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeAtomic(autoRequestPath(root, request.sessionId), `${JSON.stringify(request)}\n`);
}

export function clearAutoRequest(root: string, sessionId: string): void {
  try {
    rmSync(autoRequestPath(root, sessionId), { force: true });
  } catch {
    // PostCompact cleanup is best effort; the companion also deduplicates checkpointKey.
  }
}
