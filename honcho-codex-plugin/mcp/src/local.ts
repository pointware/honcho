import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { Honcho } from "@honcho-ai/sdk";
import type { ToolContext } from "./types.js";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as net from "net";
import { fileURLToPath } from "url";

const DEFAULT_BASE_URL = "https://api.honcho.dev";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);
const HONCHO_CONFIG_RELATIVE_PATH = path.join(".honcho", "config.json");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpDir = path.resolve(__dirname, "..");
const pluginRoot = path.resolve(mcpDir, "..");

function readEnvBaseUrl() {
  return (
    process.env.HONCHO_API_URL?.trim() ||
    process.env.HONCHO_BASE_URL?.trim() ||
    process.env.HONCHO_URL?.trim() ||
    ""
  );
}

function readSharedConfig() {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return {};
  }

  const configPath = path.join(homeDir, HONCHO_CONFIG_RELATIVE_PATH);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Warning: failed to read ${configPath}: ${message}`);
    return {};
  }
}

function checkPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function parseBaseUrl(baseUrl: string): URL | null {
  try {
    return new URL(baseUrl);
  } catch {
    return null;
  }
}

function resolveLocalEndpoint(baseUrl: string) {
  const parsed = parseBaseUrl(baseUrl);
  if (!parsed || !LOCAL_HOSTS.has(parsed.hostname)) {
    return null;
  }

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  return {
    host: parsed.hostname,
    port,
  };
}

function findComposeDir() {
  const candidates = [
    path.resolve(pluginRoot, ".."),
    path.resolve(pluginRoot, "..", "honcho"),
    pluginRoot,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "docker-compose.yml"))) {
      return candidate;
    }
  }

  return null;
}

function startCompose(composeDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "up", "-d"], {
      cwd: composeDir,
      stdio: "ignore",
    });

    child.once("error", (error) => {
      console.error(`Failed to execute docker compose: ${error.message}`);
      resolve(false);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      console.error(`docker compose exited with code ${code ?? "unknown"}.`);
      resolve(false);
    });
  });
}

async function ensureBackendRunning(baseUrl: string) {
  const endpoint = resolveLocalEndpoint(baseUrl);
  if (!endpoint) {
    return;
  }

  const isAlive = await checkPort(endpoint.port, endpoint.host);
  if (isAlive) {
    console.error(`Honcho backend is already running on ${endpoint.host}:${endpoint.port}.`);
    return;
  }

  if (process.env.HONCHO_AUTO_START_BACKEND !== "1") {
    console.error(
      `Honcho backend is not running on ${endpoint.host}:${endpoint.port}. ` +
      "Start it manually or set HONCHO_AUTO_START_BACKEND=1 to allow docker compose auto-start.",
    );
    return;
  }

  const composeDir = findComposeDir();
  if (!composeDir) {
    console.error(
      `Honcho backend is not running on ${endpoint.host}:${endpoint.port}, ` +
      `and no docker-compose.yml was found near ${pluginRoot}.`,
    );
    return;
  }

  console.error(`Honcho backend is not running. Attempting opt-in start from ${composeDir}.`);
  const started = await startCompose(composeDir);
  if (!started) {
    return;
  }

  console.error(`Waiting for Honcho backend on ${endpoint.host}:${endpoint.port} (up to 15 seconds)...`);
  for (let i = 0; i < 15; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const alive = await checkPort(endpoint.port, endpoint.host);
    if (alive) {
      console.error(`Honcho backend successfully started on ${endpoint.host}:${endpoint.port}.`);
      return;
    }
  }

  console.error("Warning: Honcho backend failed to start within 15 seconds.");
}

const sharedConfig = readSharedConfig();
const rawApiKey = process.env.HONCHO_API_KEY?.trim() || sharedConfig.apiKey || "";
const apiKey = rawApiKey === "YOUR_HONCHO_API_KEY" ? "" : rawApiKey;
const userName = process.env.HONCHO_USER_NAME?.trim() || process.env.USER || "user";
const assistantName = process.env.HONCHO_ASSISTANT_NAME?.trim() || "assistant";
const baseUrl = readEnvBaseUrl() || sharedConfig.baseUrl || DEFAULT_BASE_URL;
const workspaceId = process.env.HONCHO_WORKSPACE_ID?.trim() || "default";

if (!apiKey) {
  if (baseUrl === DEFAULT_BASE_URL) {
    console.error(
      "Warning: HONCHO_API_KEY is not set. Tool calls against api.honcho.dev will fail until you export HONCHO_API_KEY or run `honcho init`.",
    );
  } else {
    console.error(
      `Warning: HONCHO_API_KEY is not set. Continuing against ${baseUrl}; this only works when the self-hosted Honcho server accepts unauthenticated requests.`,
    );
  }
}

const config = {
  apiKey,
  userName,
  assistantName,
  baseUrl,
  workspaceId,
};

const honcho = new Honcho({
  apiKey: config.apiKey,
  baseURL: config.baseUrl,
  workspaceId: config.workspaceId,
});

const ctx: ToolContext = {
  honcho,
  config,
};

const server = createServer(ctx);

async function run() {
  await ensureBackendRunning(config.baseUrl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Honcho MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
