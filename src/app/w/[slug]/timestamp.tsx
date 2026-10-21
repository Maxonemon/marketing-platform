// Server time zones differ, so times are always shown in UTC.
const TIMESTAMP = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

interface TimestampProps {
  date: Date;
  className?: string;
}

export function Timestamp({ date, className }: TimestampProps) {
  return (
    <time dateTime={date.toISOString()} className={className}>
      {TIMESTAMP.format(date)} UTC
    </time>
  );
}
