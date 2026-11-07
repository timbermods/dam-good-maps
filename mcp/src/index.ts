// The Dam Good Maps MCP server over stdio: what Claude Desktop and `npx` start (mcp/README.md).

import { isMainThread } from "node:worker_threads";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

// stdout carries the protocol alone: anything the engine logs goes to stderr
console.log = console.info = console.warn = console.debug = (...a: unknown[]) => process.stderr.write(`${a.map(String).join(" ")}\n`);

// (the generator's worker thread runs this same file, jobs.ts, and connects nothing)
if (isMainThread) await createServer().connect(new StdioServerTransport());
