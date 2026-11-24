
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3000;
const DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "history.json");

const hosts = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"],
  youtube: ["youtube.com", "youtu.be"]
};

fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");

function read() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function write(items) {
  fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 8192) {
        reject(Error("BODY_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {
      success: true,
      service: "Smart Downloader API"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/links") {
    return send(res, 200, { items: read() });
  }

  if (req.method === "POST" && url.pathname === "/api/links") {
    try {
      const data = await body(req);
      const platform = String(data.platform || "").toLowerCase();

      let parsed;
      try {
        parsed = new URL(String(data.url || ""));
      } catch {
        return send(res, 400, { error: "INVALID_URL" });
      }

      const host = parsed.hostname.toLowerCase();
      const allowed = (hosts[platform] || []).some(
        domain => host === domain || host.endsWith("." + domain)
      );

      if (parsed.protocol !== "https:" || !allowed) {
        return send(res, 400, {
          error: "PLATFORM_URL_MISMATCH"
        });
      }

      const item = {
        id: crypto.randomUUID(),
        platform,
        url: parsed.href,
        status: "awaiting_authorized_provider",
        createdAt: new Date().toISOString()
      };

      write([item, ...read()].slice(0, 100));

      return send(res, 201, {
        success: true,
        item
      });
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }

  const match = url.pathname.match(/^\/api\/links\/([a-f0-9-]+)$/i);

  if (req.method === "DELETE" && match) {
    write(read().filter(item => item.id !== match[1]));
    return send(res, 200, { success: true });
  }

  return send(res, 404, { error: "NOT_FOUND" });

}).listen(PORT, () => {
  console.log("Smart Downloader API running on port " + PORT);
});
