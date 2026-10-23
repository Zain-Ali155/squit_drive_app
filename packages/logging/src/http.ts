import morgan from "morgan";
import type { Logger } from "./types.js";

type HttpLoggerOptions = Readonly<{
  logger: Logger;
  format?: "combined" | "common" | "dev" | "short" | "tiny";
  redactQuery?: boolean;
}>;

const safePathFormat: morgan.FormatFn = (tokens, request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const method = tokens.method?.(request, response) ?? "-";
  const status = tokens.status?.(request, response) ?? "-";
  const duration = tokens["response-time"]?.(request, response) ?? "-";
  const length = tokens.res?.(request, response, "content-length") ?? "-";
  return `${method} ${path} ${status} ${duration} ms - ${length}`;
};

export const createHttpLogger = ({ logger, format = "combined", redactQuery = false }: HttpLoggerOptions): ReturnType<typeof morgan> => {
  const options = {
    stream: {
      write: (line: string) => { logger.info("HTTP request", { http: line.trim() }); }
    }
  };
  return redactQuery ? morgan(safePathFormat, options) : morgan(format, options);
};
