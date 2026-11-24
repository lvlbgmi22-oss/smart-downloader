
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "history.json");

const hosts = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"],
  youtube: ["youtube.com", "youtu.be"]
};

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeHistory(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 8192) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {
      success: true,
      service: "Smart Downloader API"
    });
  }

  if (req.method === "GET" && url.pathname === "/api/links") {
    return send(res, 200, { items: readHistory() });
  }

  if (req.method === "POST" && url.pathname === "/api/links") {
    try {
      const body = await readBody(req);
      const platform = String(body.platform || "").toLowerCase();

      let parsed;
      try {
        parsed = new URL(String(body.url || ""));
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

      writeHistory([item, ...readHistory()].slice(0, 100));

      return send(res, 201, {
        success: true,
        item,
        message: "Link verified. No media downloaded."
      });

    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }

  return send(res, 404, { error: "NOT_FOUND" });

}).listen(PORT, () => {
  console.log("Smart Downloader API running on port " + PORT);
});
