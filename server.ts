const PORT = Number(Bun.env.PORT ?? 3000);
const PUBLIC_DIR = new URL("./public/", import.meta.url);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Sent on every response. Everything the page loads is same-origin, so the CSP
// can be locked to 'self'.
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-opener-policy": "same-origin",
};

function contentTypeFor(pathname: string): string | undefined {
  const dot = pathname.lastIndexOf(".");
  if (dot === -1) return undefined;
  return CONTENT_TYPES[pathname.slice(dot)];
}

function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8", ...extra },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return text("Method Not Allowed", 405, { allow: "GET, HEAD" });
    }

    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    // Prevent path traversal: resolve and confirm it stays under public/. The
    // path stays percent-encoded here and is decoded exactly once, by Bun.file.
    const fileUrl = new URL("." + pathname, PUBLIC_DIR);
    if (!fileUrl.href.startsWith(PUBLIC_DIR.href)) {
      return text("Forbidden", 403);
    }

    // Bun.file throws on paths it can't map to a file (encoded "/", NUL bytes,
    // malformed escapes); treat those as missing rather than a 500.
    let file: ReturnType<typeof Bun.file>;
    try {
      file = Bun.file(fileUrl);
      if (!(await file.exists())) return text("Not Found", 404);
    } catch {
      return text("Not Found", 404);
    }

    const type = contentTypeFor(fileUrl.pathname);
    return new Response(file, {
      headers: type ? { ...SECURITY_HEADERS, "content-type": type } : SECURITY_HEADERS,
    });
  },
  // Backstop: never fall through to Bun's development error page, which
  // exposes stack traces and source to the client.
  error(err) {
    console.error(err);
    return text("Internal Server Error", 500);
  },
});

console.log(`DinoQuest running at http://localhost:${server.port}`);
