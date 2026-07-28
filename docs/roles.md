# Roles

AutoPwnDoc has two built-in roles:

- `user`: can work on audits they create or collaborate on, read shared data, and submit vulnerability updates.
- `admin`: has every permission.

Custom roles are stored in the database and managed from **Data → Roles**. The legacy `backend/src/config/roles.json` file is only a fallback/seed source; do not edit it to manage live roles.

## Permissions

The role editor lists the current permission catalog grouped by domain. Important groups include:

- Audits: `audits:create`, `audits:read`, `audits:update`, `audits:delete`, plus `-all` variants for every audit.
- Reviews: `audits:review` and `audits:review-all`.
- Taxonomy: `vulnerability-taxonomy:read`, `vulnerability-taxonomy:create`, `vulnerability-taxonomy:update`, and `vulnerability-taxonomy:delete`.
- Data: audit types, custom fields, custom sections, templates, companies, users, roles, and backups.
- Settings, spellcheck, images, archives, and vulnerability-library permissions.

The live catalog is available through `GET /api/data/roles/permissions`; use it instead of copying an old permission list into a role definition.

## Creating a custom role

Create a role in **Data → Roles**, choose a display name and description, select permissions, and optionally inherit the built-in `user` role. Custom roles may inherit only from `user`.

For example, a reviewer normally inherits `user` and receives `audits:review`. Add `audits:read-all` and `audits:review-all` only when the reviewer must work across every audit.

## Per-user grants

Administrators can grant or revoke individual permissions from a collaborator without creating a new role. Those grants are merged with the user role when the user receives a fresh token.
