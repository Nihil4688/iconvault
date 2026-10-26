// Server entry point. Loads env, connects the database, and starts the HTTP server.
import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { assertProductionConfig } from "./config/production.js";
import { warnIfNoAdmins } from "./lib/admins.js";

assertProductionConfig();
const app = createApp();
const PORT = Number(process.env.PORT ?? 5000);

async function start() {
    warnIfNoAdmins();
    try {
        await connectDb();
    } catch (err) {
        console.error("[server] Starting without DB connection.");
    }

    app.listen(PORT, () => {
        console.log(`[server] Running on port ${PORT}`);
    });
}

void start();
