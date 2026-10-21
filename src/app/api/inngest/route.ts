import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest calls this route to run background functions, so the session proxy skips it.
// Outside dev mode the SDK rejects any request not signed with INNGEST_SIGNING_KEY,
// syncs included: by default an unsigned PUT would register whatever URL it came in on.
export const { GET, POST, PUT } = serve({ client: inngest, functions, enableUnauthedSync: false });
