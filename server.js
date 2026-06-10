const http = require("http");
const fs = require("fs");
const path = require("path");
const { URLSearchParams } = require("url");

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const ORDER_LOG = path.join(__dirname, "orders.jsonl");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Order is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validateOrder(order) {
  const required = ["customerName", "phone", "address", "deliveryDate", "deliveryWindow", "items", "total"];
  const missing = required.filter(key => !order[key]);
  if (missing.length) return `Missing ${missing.join(", ")}.`;
  if (!Array.isArray(order.items) || order.items.length === 0) return "Please choose at least one loaf.";
  if (!Number.isFinite(Number(order.total)) || Number(order.total) <= 0) return "Order total is invalid.";
  return "";
}

function orderMessage(order) {
  const lines = order.items.map(item => `${item.quantity} x ${item.name} (${item.subtotal})`).join("\n");
  return [
    "New Mardi's Bread order",
    `Name: ${order.customerName}`,
    `Phone: ${order.phone}`,
    `Delivery: ${order.deliveryDate}, ${order.deliveryWindow}`,
    `Address: ${order.address}`,
    `Items:\n${lines}`,
    `Total: ${order.totalFormatted}`,
    order.note ? `Note: ${order.note}` : ""
  ].filter(Boolean).join("\n");
}

async function sendSmsAlert(message) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE, OWNER_PHONE } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_PHONE || !OWNER_PHONE) {
    return { sent: false, mode: "demo", detail: "Add Twilio environment variables to send real phone alerts." };
  }

  const body = new URLSearchParams({
    From: TWILIO_FROM_PHONE,
    To: OWNER_PHONE,
    Body: message
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Phone alert failed: ${response.status} ${text}`);
  }

  return { sent: true, mode: "sms" };
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  if ((req.method === "GET" || req.method === "HEAD") && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "mardis-bread" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/orders") {
    try {
      const order = JSON.parse(await readRequestBody(req));
      const problem = validateOrder(order);
      if (problem) {
        sendJson(res, 400, { ok: false, message: problem });
        return;
      }

      const savedOrder = {
        ...order,
        id: `MARDI-${Date.now().toString(36).toUpperCase()}`,
        receivedAt: new Date().toISOString()
      };
      fs.appendFileSync(ORDER_LOG, `${JSON.stringify(savedOrder)}\n`);

      const alert = await sendSmsAlert(orderMessage(savedOrder));
      sendJson(res, 201, { ok: true, orderId: savedOrder.id, alert });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error.message || "Could not place order." });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`Mardi's Bread site is running at http://${HOST}:${PORT}`);
});
