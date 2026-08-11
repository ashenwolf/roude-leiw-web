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

import { lookupMany, suggestMany, wordList } from "./lib/lod-client.mjs";

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
      "Look up Luxembourgish words in the official Lëtzebuerger Online " +
      "Dictionnaire (lod.lu). Returns authoritative senses (translation plus " +
      "the clarifier that disambiguates it), part of speech, and grammatical " +
      "gender (m/f/n — determines the article). " +
      "PASS A WHOLE BATCH AT ONCE via `words` — verifying a vocabulary list " +
      "one call per word is the slow path and wastes context. " +
      "A word with no entries comes back with `found: 0` and spellchecker " +
      "`suggestions` already filled in, so no follow-up lod_suggest is needed: " +
      "0 results WITH suggestions means it is misspelled, 0 results with NO " +
      "suggestions is usually a legitimate inflected form or compound.",
    inputSchema: {
      type: "object",
      properties: {
        words: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 60,
          description:
            "Luxembourgish words (lemmas) to look up in one call. Preferred over `word`; duplicates are collapsed.",
        },
        word: {
          type: "string",
          description: "Single-word convenience form. Use `words` for more than one.",
        },
        locale: LOCALE_SCHEMA,
        maxEntries: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          default: 3,
          description: "Max number of homograph entries to resolve per word.",
        },
        verbose: {
          type: "boolean",
          default: false,
          description:
            "Include IPA, declension info and per-sense numbering. Off by default — the slim shape is ~15x smaller and carries the same translation/gender signal.",
        },
      },
    },
  },
  {
    name: "lod_suggest",
    description:
      "Get spellchecker suggestions from lod.lu for possibly-misspelled or " +
      "inflected Luxembourgish words. " +
      "USUALLY UNNECESSARY: lod_lookup already returns suggestions for any word " +
      "it finds no entry for — reach for this only to spellcheck words you are " +
      "not also looking up (e.g. inflected forms inside a sentence). " +
      "PASS A BATCH via `words`. " +
      "An empty list means no suggestion, which for Luxembourgish usually " +
      "indicates a legitimate inflected form or compound rather than an error.",
    inputSchema: {
      type: "object",
      properties: {
        words: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 60,
          description:
            "Words to spellcheck in one call. Preferred over `word`; duplicates are collapsed.",
        },
        word: {
          type: "string",
          description: "Single-word convenience form. Use `words` for more than one.",
        },
        locale: LOCALE_SCHEMA,
      },
    },
  },
];

const handlers = {
  lod_lookup: (args) =>
    lookupMany(wordList(args), {
      locale: args.locale,
      maxEntries: args.maxEntries,
      verbose: args.verbose === true,
    }),
  lod_suggest: (args) => suggestMany(wordList(args), { locale: args.locale }),
};

// --- JSON-RPC plumbing -----------------------------------------------------

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const result = (id, value) => send({ jsonrpc: "2.0", id, result: value });
const error = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

// Compact, not pretty-printed: the only reader is a model, and two-space
// indentation on a 60-word batch is pure token cost.
const asTextContent = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
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
