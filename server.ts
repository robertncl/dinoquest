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

function contentTypeFor(pathname: string): string | undefined {
  const dot = pathname.lastIndexOf(".");
  if (dot === -1) return undefined;
  return CONTENT_TYPES[pathname.slice(dot)];
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") pathname = "/index.html";

    // Prevent path traversal: resolve and confirm it stays under public/.
    const fileUrl = new URL("." + pathname, PUBLIC_DIR);
    if (!fileUrl.href.startsWith(PUBLIC_DIR.href)) {
      return new Response("Forbidden", { status: 403 });
    }

    const file = Bun.file(fileUrl);
    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    const type = contentTypeFor(pathname);
    return new Response(file, type ? { headers: { "content-type": type } } : undefined);
  },
});

console.log(`DinoQuest running at http://localhost:${server.port}`);
