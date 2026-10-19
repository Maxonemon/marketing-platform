# 02: Brands and the Activity Log

**What to build:** A member creates, lists and edits Brands in their Workspace: name, website, industry, audience, voice. Invalid input is rejected with a message for each field. Every Brand creation and settings change appends an entry to the Activity Log, which any member can browse on a simple page (newest first). The Activity Log is append-only: there are no update or delete operations in code.

Spec: [../spec.md](../spec.md) (stories 12–14, 17–20, 77, 79).

**Blocked by:** 01 (Sign in and create a Workspace)

**Status:** ready-for-agent

- [ ] Create, list, read and update Brand operations in the application layer, each checking membership first
- [ ] Brand input is validated with Zod at the boundary; errors are reported per field
- [ ] One Activity Log append function records Workspace, actor, event type, subject (Brand) and non-secret details. No update/delete path exists
- [ ] Brands page (list + create) and Brand settings page (edit)
- [ ] Activity Log page lists entries for the current Workspace, newest first
- [ ] Tests: create/update Brand writes an Activity Log entry; invalid input is refused with field errors; a member of another Workspace gets not-found when reading or updating the Brand and cannot see its Activity Log entries
