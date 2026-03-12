import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function resolveRequestPath(urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : urlPathname;
  const normalizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  return path.join(projectRoot, normalizedPath);
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not Found");
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const filePath = resolveRequestPath(requestUrl.pathname);

  try {
    await access(filePath);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      sendNotFound(response);
      return;
    }

    const contentType =
      CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  } catch {
    sendNotFound(response);
  }
}

export function startServer({ port = Number(process.env.PORT) || 4173 } = {}) {
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch(() => {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve server address."));
        return;
      }

      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          })
      });
    });
  });
}

if (process.argv[1] === __filename) {
  startServer()
    .then(({ port }) => {
      console.log(`Dev server running at http://127.0.0.1:${port}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
