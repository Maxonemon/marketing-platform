import type { FieldErrors } from "@/lib/app/result";
import { CONTENT_BODY_MAX_LENGTH, CONTENT_SUBJECT_MAX_LENGTH } from "@/lib/limits";
import { Field, INPUT_CLASS } from "./form-field";

interface ContentFieldsProps {
  // null for content types without a subject line: no subject field is shown.
  subject: string | null;
  body: string;
  errors?: FieldErrors;
}

// The editable text of a Content Asset, for the Review and the Content Asset page.
export function ContentFields({ subject, body, errors }: ContentFieldsProps) {
  return (
    <>
      {subject !== null && (
        <Field label="Subject" errors={errors?.subject}>
          <input
            name="subject"
            required
            maxLength={CONTENT_SUBJECT_MAX_LENGTH}
            defaultValue={subject}
            className={INPUT_CLASS}
          />
        </Field>
      )}
      <Field label="Text" errors={errors?.body}>
        <textarea
          name="body"
          required
          rows={8}
          maxLength={CONTENT_BODY_MAX_LENGTH}
          defaultValue={body}
          className={INPUT_CLASS}
        />
      </Field>
    </>
  );
}
