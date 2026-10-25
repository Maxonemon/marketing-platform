import { AUDIENCE_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "./form-field";

interface AudienceFieldProps {
  audience: string;
  errors?: string[];
}

// Who the Proposed Action reaches; part of what the Approver approves.
export function AudienceField({ audience, errors }: AudienceFieldProps) {
  return (
    <Field label="Audience or recipients (optional; leave blank if the Channel takes none)" errors={errors}>
      <input name="audience" maxLength={AUDIENCE_MAX_LENGTH} defaultValue={audience} className={INPUT_CLASS} />
    </Field>
  );
}
