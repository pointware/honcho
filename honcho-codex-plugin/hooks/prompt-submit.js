#!/usr/bin/env node

const { Honcho } = require("../mcp/node_modules/@honcho-ai/sdk");

const apiKey = process.env.HONCHO_API_KEY;
const baseUrl = process.env.HONCHO_API_URL || "https://api.honcho.dev";
const workspaceId = process.env.HONCHO_WORKSPACE_ID || "default";

function emit(additionalContext = "") {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
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
    console.error("Failed to parse UserPromptSubmit hook input:", error.message);
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
    "default-session"
  );
}

function getPromptText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item.text === "string") {
          return item.text;
        }
        if (item && typeof item.content === "string") {
          return item.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (value && typeof value.text === "string") {
    return value.text;
  }

  if (value && typeof value.content === "string") {
    return value.content;
  }

  return "";
}

function buildAdditionalContext(context, promptText) {
  const summaryText = context?.summary?.content || "";
  const messages = Array.isArray(context?.messages) ? context.messages : [];

  if (!summaryText && messages.length === 0) {
    return "";
  }

  let additionalContext = "\n=== [Honcho Session Context] ===\n";
  if (summaryText) {
    additionalContext += `Summary of older messages:\n${summaryText}\n\n`;
  }
  if (messages.length > 0) {
    additionalContext += "Recent Messages:\n";
    messages.forEach((message) => {
      additionalContext += `[${message.peerId || "unknown"}]: ${message.content}\n`;
    });
  }
  if (promptText.trim()) {
    additionalContext += `\nCurrent Prompt:\n${promptText.trim()}\n`;
  }
  additionalContext += "=================================";

  return additionalContext.trim();
}

async function main() {
  const payload = await readStdinJson();
  const promptText = getPromptText(payload?.prompt ?? payload?.message ?? "");
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
    const context = await session.context({ summary: true });
    emit(buildAdditionalContext(context, promptText));
  } catch (error) {
    console.error(`Honcho UserPromptSubmit hook failed: ${error.message}`);
    emit("");
  }
}

main().catch((error) => {
  console.error("Fatal error in prompt-submit hook:", error);
  emit("");
  process.exit(0);
});
