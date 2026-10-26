// Input limits shared by server validation, Better Auth and the forms' hints and
// messages. No server imports, so client components can use it.

export const WORKSPACE_NAME_MAX_LENGTH = 80;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 48;
// Lowercase letters and digits in groups joined by single hyphens, e.g. acme-agency.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The longest email address SMTP allows; invitations are checked against it.
export const EMAIL_MAX_LENGTH = 254;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const BRAND_NAME_MAX_LENGTH = 80;
export const BRAND_WEBSITE_MAX_LENGTH = 2048;
export const BRAND_INDUSTRY_MAX_LENGTH = 80;
export const BRAND_AUDIENCE_MAX_LENGTH = 1000;
export const BRAND_VOICE_MAX_LENGTH = 2000;
// Each Brand list: offers, keywords, prohibited phrases and required disclaimers.
export const BRAND_LIST_MAX_ITEMS = 30;
export const BRAND_LIST_ITEM_MAX_LENGTH = 300;

export const CONTENT_BRIEF_MAX_LENGTH = 1000;

// A Content Asset, as the content agent writes it and as a member edits it.
export const CONTENT_SUBJECT_MAX_LENGTH = 150;
export const CONTENT_BODY_MAX_LENGTH = 5000;
// The audience or recipients set when proposing.
export const AUDIENCE_MAX_LENGTH = 1000;

export const APPROVAL_COMMENT_MAX_LENGTH = 1000;
