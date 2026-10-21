import { inngest } from "@/inngest/client";
import { authEnv, dbEnv, inngestEnv } from "@/lib/env";

// Runs once when the server starts: missing env vars stop startup with their names.
export function register(): void {
  dbEnv();
  authEnv();
  inngestEnv(inngest.mode);
}
