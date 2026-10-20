"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

// One generic message for every failure, so the form never reveals which emails exist.
const FAILURE_MESSAGE: Record<Mode, string> = {
  "sign-in": "That email and password don't match an account.",
  "sign-up": "Couldn't create the account. Use a password of at least 8 characters, or sign in instead.",
};

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    const { error: authError } =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "") });
    setPending(false);
    if (authError) {
      setError(FAILURE_MESSAGE[mode]);
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
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">
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
