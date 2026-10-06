// Local operator entry point: long-running server that also serves the built frontend.
// The serverless deployment imports createApp directly from ./app.mjs instead.
import { createApp } from "./app.mjs";
const app = await createApp({ serveStatic: process.env.NODE_ENV === "production" });
const port = process.env.PORT || 8787;
app.listen(port, "127.0.0.1", () =>
  console.log("Atlas Sheets gateway: http://localhost:" + port),
);
