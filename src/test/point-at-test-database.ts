import { pointAtTestDatabase } from "./test-env";

// Side-effect import: must run before anything imports @/lib/db.
pointAtTestDatabase();
