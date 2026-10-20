"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, SERVER_ERROR, type AuthMode as Mode } from "./auth-error-message";

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const failure = await submitCredentials(mode, form);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {mode === "sign-up" && <Field label="Name" name="name" type="text" autoComplete="name" />}
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
        }}
        className="text-sm underline"
      >
        {mode === "sign-in" ? "No account? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}

// Returns the message to show, or null on success. A request that never reaches the
// server (network failure) throws instead of returning an error, so catch it too.
async function submitCredentials(mode: Mode, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  try {
    const { error } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "") });
    return error ? authErrorMessage(mode, error) : null;
  } catch {
    return SERVER_ERROR;
  }
}

interface FieldProps {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
}

function Field({ label, name, type, autoComplete }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input name={name} type={type} autoComplete={autoComplete} required className="rounded border px-2 py-1.5" />
    </label>
  );
}
