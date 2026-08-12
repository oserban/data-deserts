import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 8080);
const basePath = normalizeBasePath(process.env.BASE_PATH || "");
const types = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml"
};
let latestState = null;
let latestCountries = null;
const pageRoutes = {
  "/": "/do-app/controller.html",
  "/controller": "/do-app/controller.html",
  "/mini-controller": "/do-app/mini-controller.html",
  "/renderer": "/do-app/renderer.html",
  "/details": "/do-app/details.html",
  "/datasets": "/do-app/datasets.html",
  "/project": "/do-app/project.html",
  "/about": "/do-app/project.html"
};

function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  return "/" + value.split("/").filter(Boolean).join("/");
}

function applicationPath(pathname) {
  if (basePath && pathname === basePath) return "/";
  if (basePath && pathname.startsWith(basePath + "/")) return pathname.slice(basePath.length);
  return pathname;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");
  if (basePath && requestUrl.pathname === basePath) {
    response.writeHead(308, { Location: basePath + "/" + requestUrl.search }).end();
    return;
  }
  const pathname = applicationPath(requestUrl.pathname);
  if (pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
      .end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (pathname === "/qr") {
    const text = requestUrl.searchParams.get("text") || "";
    if (!text || text.length > 2048) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid QR text");
      return;
    }
    try {
      const svg = await QRCode.toString(text, {
        type: "svg", errorCorrectionLevel: "M", margin: 2,
        color: { dark: "#0f1620", light: "#ffffff" }
      });
      response.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" }).end(svg);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("QR generation failed");
    }
    return;
  }
  const route = pageRoutes[pathname] || pathname;
  if (!route.startsWith("/app/") && !route.startsWith("/do-app/")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const file = resolve(root, "." + decodeURIComponent(route));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden"); return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const relay = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (request, socket, head) => {
  let pathname;
  try { pathname = applicationPath(new URL(request.url, "http://localhost").pathname); }
  catch (error) { socket.destroy(); return; }
  if (pathname !== "/ws") { socket.destroy(); return; }
  relay.handleUpgrade(request, socket, head, (webSocket) => relay.emit("connection", webSocket, request));
});

function peerCounts() {
  let controllers = 0, miniControllers = 0, renderers = 0, details = 0;
  relay.clients.forEach((client) => {
    if (client.role === "controller") controllers++;
    if (client.role === "mini-controller") miniControllers++;
    if (client.role === "renderer") renderers++;
    if (client.role === "details") details++;
  });
  return { type: "peers", controllers, miniControllers, renderers, details };
}

function broadcast(message, role) {
  const encoded = JSON.stringify(message);
  relay.clients.forEach((client) => {
    const matchesRole = !role || (Array.isArray(role) ? role.includes(client.role) : client.role === role);
    if (client.readyState === WebSocket.OPEN && matchesRole) client.send(encoded);
  });
}

if (process.env.NODE_ENV !== "production") {
  let reloadTimer;
  [resolve(root, "app"), resolve(root, "do-app")].forEach((directory) => {
    const watcher = watch(directory, { recursive: true }, (_event, filename) => {
      if (!filename || filename.endsWith(".tmp")) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => broadcast({ type: "reload" }), 80);
    });
    watcher.on("error", (error) => console.warn(`Live reload watcher failed: ${error.message}`));
  });
}

relay.on("connection", (socket) => {
  socket.role = "unknown";
  socket.on("message", (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch (error) { return; }
    if (message.type === "hello" && ["controller", "mini-controller", "renderer", "details"].includes(message.role)) {
      socket.role = message.role;
      if (["mini-controller", "renderer", "details"].includes(socket.role) && latestState) socket.send(JSON.stringify(latestState));
      broadcast(peerCounts());
      return;
    }
    if (message.type === "state" && socket.role === "controller" && message.state) {
      const state = { ...message.state };
      if (latestCountries) state.countries = latestCountries.slice();
      else if (Array.isArray(state.countries)) latestCountries = state.countries.slice();
      latestState = { type: "state", state };
      broadcast(latestState, ["mini-controller", "renderer", "details"]);
      if (latestCountries) socket.send(JSON.stringify({ type: "countries", countries: latestCountries }));
      return;
    }
    if (message.type === "countries" && socket.role === "mini-controller" && Array.isArray(message.countries)) {
      const countries = message.countries.filter((country, index, values) =>
        typeof country === "string" && /^[A-Z]{3}$/.test(country) && values.indexOf(country) === index
      ).slice(0, 32);
      latestCountries = countries;
      if (latestState) {
        latestState = { type: "state", state: { ...latestState.state, countries } };
        broadcast(latestState, ["mini-controller", "renderer", "details"]);
      }
      broadcast({ type: "countries", countries }, "controller");
      return;
    }
    if (message.type === "navigation" && socket.role === "controller" &&
        ["zoomIn", "zoomOut", "pan", "region", "country"].includes(message.action)) {
      broadcast({ type: "navigation", action: message.action, value: message.value }, ["renderer", "details"]);
      return;
    }
    if (message.type === "selection" && socket.role === "renderer" &&
        typeof message.country === "string" && /^[A-Z]{3}$/.test(message.country)) {
      broadcast({ type: "selection", country: message.country }, "controller");
      return;
    }
    if (message.type === "view" && socket.role === "renderer" &&
        Number.isFinite(message.zoom) && Number.isFinite(message.lat) && Number.isFinite(message.lng)) {
      broadcast({ type: "view", zoom: message.zoom, lat: message.lat, lng: message.lng }, "controller");
    }
  });
  socket.on("close", () => broadcast(peerCounts()));
});

server.listen(port, () => {
  const localBase = `http://localhost:${port}${basePath}`;
  console.log(`Controller: ${localBase}/controller`);
  console.log(`Mobile:     ${localBase}/mini-controller`);
  console.log(`Renderer:   ${localBase}/renderer`);
  console.log(`Details:    ${localBase}/details`);
  console.log(`Datasets:   ${localBase}/datasets`);
  console.log(`Project:    ${localBase}/project`);
  if (process.env.NODE_ENV !== "production") console.log("Development live reload enabled.");
});
