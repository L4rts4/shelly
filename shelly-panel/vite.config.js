import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import http from "node:http";

function shellyProxy() {
  return {
    name: "shelly-proxy",
    configureServer(server) {
      server.middlewares.use("/shelly", (req, res) => {
        const [ip, ...rest] = req.url.slice(1).split("/");
        const path = "/" + rest.join("/");

        const headers = { ...req.headers, host: ip };
        delete headers.origin;
        delete headers.referer;

        const proxyReq = http.request(
          { host: ip, port: 80, path, method: req.method, headers },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, {
              ...proxyRes.headers,
              "Access-Control-Allow-Origin": "*",
            });
            proxyRes.pipe(res);
          }
        );

        proxyReq.on("error", (err) => {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end("Laite ei vastaa: " + err.message);
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), shellyProxy()],
});