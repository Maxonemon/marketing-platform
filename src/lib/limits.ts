// Input limits shared by server validation, Better Auth and the forms' hints and
// messages. No server imports, so client components can use it.

export const WORKSPACE_NAME_MAX_LENGTH = 80;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;
// Lowercase letters and digits in groups joined by single hyphens, e.g. acme-agency.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const BRAND_NAME_MAX_LENGTH = 80;
export const BRAND_WEBSITE_MAX_LENGTH = 2048;
export const BRAND_INDUSTRY_MAX_LENGTH = 80;
export const BRAND_AUDIENCE_MAX_LENGTH = 1000;
export const BRAND_VOICE_MAX_LENGTH = 2000;

export const CONTENT_BRIEF_MAX_LENGTH = 1000;
