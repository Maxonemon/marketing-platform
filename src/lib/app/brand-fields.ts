// The Brand settings. Its own module so brands.ts (the settings schema) and
// activity-log.ts (what a change records) share it without importing each other.
// Logged entries are parsed against this list, so renaming or removing a field means
// keeping the old name here or migrating the logged entries.
export const BRAND_FIELDS = ["name", "websiteUrl", "industry", "audience", "voice"] as const;

export type BrandField = (typeof BRAND_FIELDS)[number];
