#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function existing(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  } finally {
    try {
      unlinkSync(temp);
    } catch {
      // Best-effort cleanup; the final file is either the old or complete new value.
    }
  }
}

const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error("usage: provision-auto.mjs --target pi|codex --home DIR --key-file FILE");
  }
  values.set(key.slice(2), value);
}
const target = values.get("target");
const home = values.get("home");
const keyFile = values.get("key-file");
if (!target || !home || !keyFile || !["pi", "codex"].includes(target)) {
  throw new Error("usage: provision-auto.mjs --target pi|codex --home DIR --key-file FILE");
}
const apiKey = readFileSync(path.resolve(keyFile), "utf8").trim();
if (!apiKey || apiKey.length > 1024 || /[\x00-\x1f\x7f]/u.test(apiKey)) {
  throw new Error("the private key file does not contain one valid TypeSafe key");
}
if (target === "pi") {
  const file = path.join(path.resolve(home), "compact-adviser.json");
  writeAtomic(file, {
    ...existing(file),
    version: 1,
    mode: "auto",
    minContextTokens: 40000,
    autoAcknowledged: true,
    logRequests: false,
    typesafeApiKey: apiKey,
  });
} else {
  const file = path.join(path.resolve(home), "compact-adviser", "settings.json");
  writeAtomic(file, {
    ...existing(file),
    version: 1,
    mode: "auto",
    minContextTokens: 40000,
    logRequests: false,
    typesafeApiKey: apiKey,
  });
}
console.log(JSON.stringify({ target, mode: "auto", key: "saved", requestLog: "off" }));
