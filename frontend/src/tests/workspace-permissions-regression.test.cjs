'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const repoPath = (...parts) => path.join(__dirname, '..', '..', '..', ...parts);

const home = source('layouts', 'home.vue');
const toolsPage = source('pages', 'tools', 'index.vue');
const guidesPage = source('pages', 'guides', 'index.vue');
const routes = source('router', 'routes.js');
const authBoot = source('boot', 'auth.js');
const roleUi = source('pages', 'data', 'roles', 'roles.js');
const catalog = require(repoPath('backend', 'src', 'lib', 'permissions-catalog.js'));
const toolRoutes = fs.readFileSync(repoPath('backend', 'src', 'routes', 'tool.js'), 'utf8');
const guideRoutes = fs.readFileSync(repoPath('backend', 'src', 'routes', 'guide.js'), 'utf8');

const groups = Object.fromEntries(catalog.catalog.map(group => [group.key, group.permissions.map(permission => permission.scope)]));

assert.deepStrictEqual(groups.tools, ['tools:read', 'tools:create', 'tools:update', 'tools:delete']);
assert.deepStrictEqual(groups.licenses, ['licenses:read', 'licenses:create', 'licenses:update', 'licenses:delete']);
assert.deepStrictEqual(groups.guides, ['guides:read', 'guides:run', 'guides:create', 'guides:update', 'guides:delete']);

assert(
  roleUi.includes('togglePermission(scope, value)') && roleUi.includes('this.currentRole.allows.push(scope)'),
  'Roles management must persist each read/create/update/delete/run permission independently'
);

const toolsNavCondition = "userService.isAllowed('tools:read') || userService.isAllowed('licenses:read')";
assert.strictEqual(home.split(toolsNavCondition).length - 1, 2, 'desktop and mobile Tools navigation must support tool or license readers');
assert.strictEqual(home.split("userService.isAllowed('guides:read')").length - 1, 2, 'desktop and mobile Guides navigation must require guides:read');

assert(
  toolsPage.includes('<q-tab v-if="canReadTools"') &&
    toolsPage.includes('<q-tab v-if="canReadLicenses"') &&
    toolsPage.includes("if (this.canReadTools) this.tools = (await ToolService.getTools())") &&
    toolsPage.includes("else if (this.canReadLicenses) this.tab = 'licenses'"),
  'Tools and Licenses tabs and API reads must be controlled independently'
);

assert(
  toolsPage.includes("canCreateTools() { return UserService.isAllowed('tools:create') }") &&
    toolsPage.includes("canUpdateTools() { return UserService.isAllowed('tools:update') }") &&
    toolsPage.includes("canCreateLicenses() { return UserService.isAllowed('licenses:create') }") &&
    toolsPage.includes("canUpdateLicenses() { return UserService.isAllowed('licenses:update') }") &&
    guidesPage.includes("canCreate() { return UserService.isAllowed('guides:create') }") &&
    guidesPage.includes("canUpdate() { return UserService.isAllowed('guides:update') }"),
  'edit controls must not be implied by read permissions'
);

for (const scope of ['tools:read', 'tools:create', 'tools:update', 'tools:delete',
  'licenses:read', 'licenses:create', 'licenses:update', 'licenses:delete']) {
  assert(toolRoutes.includes(`acl.hasPermission('${scope}')`), `Tool API must enforce ${scope}`);
}
for (const scope of ['guides:read', 'guides:run', 'guides:create', 'guides:update', 'guides:delete']) {
  assert(guideRoutes.includes(`acl.hasPermission('${scope}')`), `Guide API must enforce ${scope}`);
}

assert(
  routes.includes("permissionsAny: ['tools:read', 'licenses:read']") &&
    routes.includes("permissionsAny: ['guides:read']") &&
    authBoot.includes('to.meta.permissionsAny.some(permission => User.isAllowed(permission))'),
  'direct navigation must reject users without a relevant read permission'
);

console.log('Workspace permission regression tests passed');
