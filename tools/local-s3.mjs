/**
 * A minimal S3-compatible store for local development.
 *
 * Point R2_ENDPOINT at it and the whole pipeline runs on a laptop with no
 * cloud credentials: uploads, derivatives, thumbnails, galleries. That matters
 * because the alternative is either handing every developer real R2 keys, or
 * never exercising the storage path until production.
 *
 * It ignores signatures entirely and stores objects as files. That is fine for
 * what it is and unacceptable for anything else — it binds to localhost and
 * refuses to start when NODE_ENV is production.
 *
 *   node tools/local-s3.mjs            # http://127.0.0.1:9000, data in .s3-data/
 */

import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("local-s3 is a development tool and will not run in production");
  process.exit(1);
}

const PORT = Number(process.env.LOCAL_S3_PORT ?? 9000);
const ROOT = resolve(process.env.LOCAL_S3_DIR ?? ".s3-data");

/** Strips the query string and the leading bucket segment. */
function objectPath(url) {
  const path = decodeURIComponent(url.split("?")[0]).replace(/^\/+/, "");
  const target = join(ROOT, path);
  // Refuse anything that climbs out of the data directory.
  if (!target.startsWith(ROOT)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  const target = objectPath(req.url ?? "/");
  if (!target) {
    res.writeHead(400).end("bad path");
    return;
  }

  try {
    if (req.method === "PUT") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"local"' }).end();
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const body = await readFile(target);
      res.writeHead(200, {
        "content-type": target.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream",
        "content-length": body.length,
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    res.writeHead(405).end();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    res.writeHead(500).end(String(error));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`local S3 on http://127.0.0.1:${PORT}, storing in ${ROOT}`);
});
