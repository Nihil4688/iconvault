// Vercel function entry point. The Express app is exported for Vercel to invoke per request.
import { createApp } from "./app.js";
import { assertProductionConfig } from "./config/production.js";
import { warnIfNoAdmins } from "./lib/admins.js";

assertProductionConfig();
warnIfNoAdmins();

export default createApp();
