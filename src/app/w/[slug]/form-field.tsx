import type { ReactNode } from "react";

export const INPUT_CLASS = "rounded border px-2 py-1.5";

interface FieldProps {
  label: string;
  errors?: string[];
  children: ReactNode;
}

// A labelled form control with its field errors from the server.
export function Field({ label, errors, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
      {errors?.length ? <span role="alert" className="text-red-600">{errors.join(" ")}</span> : null}
    </label>
  );
}
