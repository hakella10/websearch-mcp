import * as winston from "winston";
import httpContext from "express-http-context";

export const enum LOGLEVEL {
  verbose = "verbose",
  silly = "silly",
  debug = "debug",
  info = "info",
  http = "http",
  warn = "warn",
  error = "error",
}

winston.addColors({
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  verbose: "cyan",
  debug: "blue",
  silly: "grey",
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: {},
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === "production"
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(
                ({
                  level,
                  message,
                  timestamp,
                  sessionId,
                  location,
                  ...meta
                }) => {
                  const metaStr = Object.keys(meta).length
                    ? ` ${JSON.stringify(meta)}`
                    : "";
                  return `${timestamp} [${sessionId}] ${level}: [${location}] ${message}${metaStr}`;
                },
              ),
            ),
    }),
  ],
});

export function log(
  identifier: string,
  level: LOGLEVEL,
  message: string,
  meta = {},
) {
  const sessionId = httpContext.get("sessionId") || "none";
  const logData = {
    sessionId,
    location: identifier,
    message,
    ...meta,
  };

  switch (level) {
    case LOGLEVEL.verbose:
      logger.verbose(logData);
      break;
    case LOGLEVEL.silly:
      logger.silly(logData);
      break;
    case LOGLEVEL.debug:
      logger.debug(logData);
      break;
    case LOGLEVEL.info:
      logger.info(logData);
      break;
    case LOGLEVEL.http:
      logger.http(logData);
      break;
    case LOGLEVEL.warn:
      logger.warn(logData);
      break;
    case LOGLEVEL.error:
      logger.error(logData);
      break;
    default:
      break;
  }
}
