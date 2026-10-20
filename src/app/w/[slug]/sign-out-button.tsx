"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const SIGN_OUT_FAILED = "Couldn't sign out. Check your connection and try again.";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Only leave the page once the session is really ended; otherwise say so.
  async function signOut() {
    setPending(true);
    setError(null);
    const signedOut = await endSession();
    setPending(false);
    if (!signedOut) {
      setError(SIGN_OUT_FAILED);
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={signOut} disabled={pending} className="text-sm underline disabled:opacity-50">
        Sign out
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// A network failure throws instead of returning an error, so both count as "not signed out".
async function endSession(): Promise<boolean> {
  try {
    const { error } = await authClient.signOut();
    return !error;
  } catch {
    return false;
  }
}
