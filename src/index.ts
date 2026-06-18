#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { registerAllTools } from "./tools/index.js";
import { SERVER_VERSION } from "./version.js";

const server = new Server(
  {
    name: "paperclip-mcp",
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

registerAllTools(server);

// Track SSE transports by session ID
const transports: Record<string, SSEServerTransport> = {};

async function main() {
  const port = parseInt(process.env.PAPERCLIP_MCP_PORT || "3120", 10);
  const baseUrl = process.env.PAPERCLIP_MCP_BASE_URL || `http://localhost:${port}`;

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", baseUrl);
      const pathname = url.pathname;

      // GET /sse — establish SSE stream
      if (req.method === "GET" && pathname === "/sse") {
        const transport = new SSEServerTransport("/messages", res);
        transports[transport.sessionId] = transport;
        res.on("close", () => {
          delete transports[transport.sessionId];
        });
        await server.connect(transport);
        return;
      }

      // POST /messages — handle incoming JSON-RPC messages
      if (req.method === "POST" && pathname === "/messages") {
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? transports[sessionId] : undefined;
        if (!transport) {
          res.writeHead(404);
          res.end("Session not found");
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      // Fallback
      res.writeHead(404);
      res.end("Not found. Use GET /sse or POST /messages");
    } catch (error) {
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  });

  httpServer.listen(port, () => {
    console.error(`Paperclip MCP server running on http://localhost:${port}/sse`);
  });
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
