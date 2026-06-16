#!/usr/bin/env node
/**
 * LOD MCP server — exposes the Lëtzebuerger Online Dictionnaire (lod.lu) as
 * Model Context Protocol tools, so any MCP client (Claude Code, etc.) can look
 * up authoritative Luxembourgish translations, part of speech, and gender.
 *
 * Zero runtime dependencies. Speaks the MCP **stdio transport**: newline-
 * delimited JSON-RPC 2.0 on stdin/stdout. All real logic lives in
 * ./lib/lod-client.mjs — this file is protocol wiring only.
 *
 * Register in .mcp.json:
 *   { "mcpServers": { "lod": { "command": "node",
 *       "args": ["tools/lod-mcp/server.mjs"] } } }
 *
 * Tools:
 *   lod_lookup  { word, locale?, maxEntries? }  → translations + gender + IPA
 *   lod_suggest { word, locale? }               → spellcheck suggestions
 */
import { createInterface } from "node:readline";
import process from "node:process";

import { lookup, suggest } from "./lib/lod-client.mjs";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "lod", version: "1.0.0" };

const LOCALE_SCHEMA = {
  type: "string",
  enum: ["en", "de", "fr", "pt", "nl", "lb"],
  default: "en",
  description: "Target translation language (default English).",
};

const TOOLS = [
  {
    name: "lod_lookup",
    description:
      "Look up a Luxembourgish word in the official Lëtzebuerger Online " +
      "Dictionnaire (lod.lu). Returns the matching dictionary entries with " +
      "authoritative translations, part of speech, grammatical gender " +
      "(m/f/n — determines the article), IPA, and example phrases. Inflected " +
      "forms, typos, and proper names usually return no entries; use " +
      "lod_suggest to recover from a misspelling.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "The Luxembourgish word (lemma) to look up." },
        locale: LOCALE_SCHEMA,
        maxEntries: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 3,
          description: "Max number of homograph/sense entries to resolve.",
        },
      },
      required: ["word"],
    },
  },
  {
    name: "lod_suggest",
    description:
      "Get spellchecker suggestions from lod.lu for a possibly-misspelled or " +
      "inflected Luxembourgish word. Useful to find the correct lemma before " +
      "calling lod_lookup.",
    inputSchema: {
      type: "object",
      properties: {
        word: { type: "string", description: "The word to get suggestions for." },
        locale: LOCALE_SCHEMA,
      },
      required: ["word"],
    },
  },
];

const handlers = {
  lod_lookup: ({ word, locale, maxEntries }) => lookup(word, { locale, maxEntries }),
  lod_suggest: async ({ word, locale }) => ({ word, suggestions: await suggest(word, locale) }),
};

// --- JSON-RPC plumbing -----------------------------------------------------

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const result = (id, value) => send({ jsonrpc: "2.0", id, result: value });
const error = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

const asTextContent = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

async function handleToolCall(id, params) {
  const handler = handlers[params?.name];
  if (!handler) return error(id, -32602, `Unknown tool: ${params?.name}`);
  try {
    const value = await handler(params.arguments ?? {});
    return result(id, asTextContent(value));
  } catch (e) {
    // Surface as a tool error, not a protocol error, so the model can react.
    return result(id, { ...asTextContent({ error: String(e?.message ?? e) }), isError: true });
  }
}

const methods = {
  initialize: (id) =>
    result(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    }),
  "tools/list": (id) => result(id, { tools: TOOLS }),
  "tools/call": (id, params) => handleToolCall(id, params),
  ping: (id) => result(id, {}),
};

async function dispatch(msg) {
  // Notifications (no id) require no response; we have none to act on.
  if (msg.id === undefined || msg.id === null) return;
  const method = methods[msg.method];
  if (!method) return error(msg.id, -32601, `Method not found: ${msg.method}`);
  await method(msg.id, msg.params);
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return error(null, -32700, "Parse error");
  }
  await dispatch(msg);
});
