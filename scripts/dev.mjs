import { createServer as createHttpServer } from "node:http";
import { parseArgs } from "node:util";
import { createServer as createViteServer } from "vite";
import { createApp } from "../server/app.mjs";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: process.env.VITE_PORT || "5173" },
    host: { type: "string", default: "0.0.0.0" },
  },
});

function portNumber(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

const apiPort = portNumber(process.env.PORT || "8787", "PORT");
const frontendPort = portNumber(values.port, "Frontend port");
const api = createHttpServer(await createApp());
let vite;
let shuttingDown = false;

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  await vite?.close();
  api.closeAllConnections();
  if (api.listening) await new Promise((resolve) => api.close(resolve));
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

try {
  for (let port = apiPort; ; port++) {
    try {
      await new Promise((resolve, reject) => {
        api.once("error", reject);
        api.listen(port, "127.0.0.1", () => {
          api.removeListener("error", reject);
          resolve();
        });
      });
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || port === 65535) throw error;
      console.log(`API port ${port} is in use, trying ${port + 1}…`);
    }
  }
  const selectedApiPort = api.address().port;
  console.log(`Atlas Sheets gateway: http://127.0.0.1:${selectedApiPort}`);
  vite = await createViteServer({
    server: {
      host: values.host,
      port: frontendPort,
      strictPort: false,
      proxy: { "/api": `http://127.0.0.1:${selectedApiPort}` },
    },
  });
  await vite.listen();
  vite.printUrls();
} catch (error) {
  console.error(error);
  await shutdown(1);
}
