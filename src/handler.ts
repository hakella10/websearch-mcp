import { randomUUID } from "node:crypto";
import express from "express";
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { log, LOGLEVEL } from "./utils.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { SearchOptions, SlimSearchResult } from "./types.js";

const LOGGER_NAME: string = "WEBSEARCH-MCP";
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const LAUNCH_OPTIONS = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
  ],
};
const LAUNCH_AGENT = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 768 },
  locale: "en-US",
  timezoneId: "America/New_York",
};

export async function handleTransportRequest(
  req: express.Request,
  res: express.Response,
) {
  const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
      },
      //enableDnsRebindingProtection: true,
      //allowedHosts: ['127.0.0.1'],
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = new McpServer({
      name: "web-mcp-server",
      version: "1.0.0",
    });
    server.tool(
      "web-search",
      "Performs a web search, parse the content using cheerio and returns the result",
      {
        query: z.string().describe("Query string to execute. "),
        numResults: z
          .number()
          .describe("Limit number of results. Defaults to 10")
          .default(10),
      },
      async (args: unknown) => {
        try {
          log(LOGGER_NAME, LOGLEVEL.info, `${JSON.stringify(args)}`);
          if (typeof args !== "object" || args === null) {
            log(LOGGER_NAME, LOGLEVEL.error, `Invalid Args`);
            throw new Error(
              "Invalid arguments: args must be an object and should contain query",
            );
          }

          const searchArgs = args as Record<string, unknown>;
          if (!searchArgs.query) {
            throw new Error(
              "Invalid arguments: args must be an object and should contain query",
            );
          }

          if (!searchArgs.numResults) {
            searchArgs.numResults = 5;
          }

          const content = await performWebSearch({
            query: searchArgs.query as string,
            numResults: searchArgs.numResults as number,
          });
          return {
            content: [
              { type: "text" as const, text: `${JSON.stringify(content)}` },
            ],
          };
        } catch (err) {
          log(
            LOGGER_NAME,
            LOGLEVEL.error,
            `[MCP] Error in tool handler: ${err}`,
          );
          throw err;
        }
      },
    );
    await server.connect(transport);
    log(LOGGER_NAME, LOGLEVEL.info, ` Started the Streamable Http Transport.`);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
}

export async function handleSessionRequest(
  req: express.Request,
  res: express.Response,
) {
  const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid/Missing Session Id");
    return;
  }
  log(
    LOGGER_NAME,
    LOGLEVEL.info,
    `${req.method} /mcp with sessionId=${sessionId}`,
  );
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
}

async function performWebSearch(
  options: SearchOptions,
): Promise<SlimSearchResult[]> {
  log(
    LOGGER_NAME,
    LOGLEVEL.info,
    `Tool call received: web-search ${JSON.stringify(options)}`,
  );
  let results: SlimSearchResult[] = [];

  //Implement Web Search with Playwright and Cheerio
  const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(options.query)}&source=web&limit=${options.numResults}`;
  try {
    const browser = await chromium.launch(LAUNCH_OPTIONS);
    const browserCtx = await browser.newContext(LAUNCH_AGENT);
    const page = await browserCtx.newPage();
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
    });

    const html = await page.content();
    results = results.concat(
      parseHtmlContent(html, (options.numResults as number) || 10),
    );
    browserCtx.close();
  } catch (err) {
    log(
      LOGGER_NAME,
      LOGLEVEL.error,
      `Unable to launch browser with error ${JSON.stringify(err)}`,
    );
  }
  return results;
}

function parseHtmlContent(html: string, limit: number): SlimSearchResult[] {
  const results: SlimSearchResult[] = [];
  const resultSelectors = [
    '[data-type="web"]', // Main Brave results
    ".result", // Alternative format
    ".fdb", // Brave specific format
  ];

  const $ = cheerio.load(html);
  for (const selector of resultSelectors) {
    const elements = $(selector);
    log(
      LOGGER_NAME,
      LOGLEVEL.info,
      `Found ${elements.length} elements for ${selector}`,
    );
    if (elements.length == 0 || results.length >= limit) {
      break;
    } else {
      elements.each((_index, element) => {
        if (_index < limit) {
          //Get TopN in each selector
          const $element = $(element);
          const textContent = extractContent($element);
          results.push({
            fullContent: textContent.fullContent,
          });
        }
      });
    }
  }

  return results;
}

/*
function extractTitle(element: cheerio.Cheerio<AnyNode>): {
  title: string;
  url: string;
} {
  let title = "";
  let url = "";

  const titleSelectors = [
    ".title a", // Brave specific
    "h2 a", // Common format
    ".result-title a", // Alternative format
    'a[href*="://"]', // Any external link
    ".snippet-title a", // Snippet title
  ];

  for (const titleSelector of titleSelectors) {
    const $titleElement = element.find(titleSelector).first();
    if ($titleElement.length) {
      title = $titleElement.text().trim();
      url = $titleElement.attr("href") || "";
      if (title && url && url.startsWith("http")) {
        break;
      }
    }
  }

  if (!title) {
    const textContent = element.text().trim();
    const lines = textContent
      .split("\n")
      .filter((line) => line.trim().length > 0);
    if (lines.length > 0) {
      title = lines[0].trim();
    }
  }

  return { title, url };
}*/

function extractContent(element: cheerio.Cheerio<AnyNode>): {
  description: string;
  fullContent: string;
} {
  let description = "";
  const fullContent = element.text().trim();

  const snippetSelectors = [
    ".snippet-content", // Brave specific
    ".snippet", // Generic
    ".description", // Alternative
    "p", // Fallback paragraph
  ];

  for (const snippetSelector of snippetSelectors) {
    const $snippetElement = element.find(snippetSelector).first();
    if ($snippetElement.length) {
      description = $snippetElement.text().trim();
      break;
    }
  }

  return { description, fullContent };
}
