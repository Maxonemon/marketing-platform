import type { ReactNode } from "react";

export const INPUT_CLASS = "input";

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
      {errors?.length ? <span role="alert" className="text-danger">{errors.join(" ")}</span> : null}
    </label>
  );
}
