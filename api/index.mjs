// Vercel serverless entry: /api/* is rewritten here and handled by the same Express app the
// local gateway runs. _app.mjs is produced by scripts/build-api.mjs during the build.
import { createApp } from "./_app.mjs";
const app = await createApp({ serveStatic: false });
export default app;
