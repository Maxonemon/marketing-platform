// What a member can ask content for. No server imports, so the request form can use it.
// Stored Task inputs are parsed against these lists, so renaming or removing a value
// means keeping the old one here or migrating the stored Tasks.

export const CONTENT_TYPES = ["SOCIAL_POST", "AD_COPY", "EMAIL", "HEADLINE"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  SOCIAL_POST: "Social post",
  AD_COPY: "Ad copy",
  EMAIL: "Email",
  HEADLINE: "Headline",
};

// Content types whose Content Assets carry a subject line besides the body.
export const CONTENT_TYPES_WITH_SUBJECT: ReadonlySet<ContentType> = new Set(["EMAIL"]);

// Until real Integrations arrive (Phase 4) the only Channel is the mock one, which
// records what it would have sent instead of publishing.
export const CHANNELS = ["MOCK"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  MOCK: "Mock channel (records only, publishes nothing)",
};
