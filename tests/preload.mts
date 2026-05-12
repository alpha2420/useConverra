// This file is preloaded via --import flag before all other modules
// It sets env vars from .env.local synchronously before any module validation runs
import { configDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
configDotenv({ path: path.resolve(__dirname, "../.env.local") });
