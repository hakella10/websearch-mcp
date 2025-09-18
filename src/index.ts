import "dotenv/config";
import helmet from "helmet";
import express from "express";
import httpContext from "express-http-context";
import { handleTransportRequest, handleSessionRequest } from "./handler.js";
import { log, LOGLEVEL } from "./utils.js";

const API_PORT = process.env.API_PORT || 9000;
const API_NAME = process.env.API_NAME || "websearch-mcp";

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(httpContext.middleware);
app.use((req, res, next) => {
  const sessionId = req.headers["mcp-session-id"];
  httpContext.set("tracingId", sessionId);
  next();
});
//Register POST,GET,DELETE request handlers
app.post("/mcp", handleTransportRequest);
app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.listen(API_PORT, () => {
  log("express", LOGLEVEL.info, `${API_NAME} running on ${API_PORT}`);
});
