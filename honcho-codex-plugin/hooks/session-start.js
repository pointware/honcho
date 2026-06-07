#!/usr/bin/env node

const { Honcho } = require("../mcp/node_modules/@honcho-ai/sdk");
const fs = require("fs");
const path = require("path");

function readSharedConfig() {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return {};
  }

  const configPath = path.join(homeDir, ".honcho", "config.json");
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
      baseUrl: typeof parsed.environmentUrl === "string" ? parsed.environmentUrl.trim() : "",
    };
  } catch (error) {
    console.error(`Failed to read ${configPath}:`, error.message);
    return {};
  }
}

const sharedConfig = readSharedConfig();
const apiKey = process.env.HONCHO_API_KEY?.trim() || sharedConfig.apiKey || "";
const baseUrl = process.env.HONCHO_API_URL?.trim() || sharedConfig.baseUrl || "https://api.honcho.dev";
const workspaceId = process.env.HONCHO_WORKSPACE_ID || "default";

function emit(additionalContext = "") {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })}\n`,
  );
}

async function readStdinJson() {
  let inputData = "";
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  if (!inputData.trim()) {
    return {};
  }

  try {
    return JSON.parse(inputData);
  } catch (error) {
    console.error("Failed to parse SessionStart hook input:", error.message);
    return {};
  }
}

function getSessionId(payload) {
  if (typeof payload?.transcript_path === "string") {
    const match = payload.transcript_path.match(/([a-f0-9-]{36})\.jsonl$/i);
    if (match) {
      return match[1];
    }
  }

  return (
    payload?.conversation_id ||
    payload?.sessionId ||
    payload?.session_id ||
    `session-${Date.now()}`
  );
}

function buildSessionNotice(sessionId) {
  return [
    "[Honcho]",
    `Session ready: ${sessionId}`,
    "Use Honcho MCP tools when memory context would improve the response.",
  ].join("\n");
}

async function main() {
  const payload = await readStdinJson();
  const sessionId = getSessionId(payload);

  if (!apiKey || apiKey === "YOUR_HONCHO_API_KEY") {
    emit("");
    return;
  }

  try {
    const honcho = new Honcho({
      apiKey,
      baseURL: baseUrl,
      workspaceId,
    });
    const session = await honcho.session(sessionId);
    emit(buildSessionNotice(session.id));
  } catch (error) {
    console.error(`Honcho SessionStart hook failed: ${error.message}`);
    emit("");
  }
}

main().catch((error) => {
  console.error("Fatal error in session-start hook:", error);
  emit("");
  process.exit(0);
});
