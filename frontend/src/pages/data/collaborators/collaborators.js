import { Dialog, Notify } from 'quasar';

import CollabService from '@/services/collaborator'
import UserService from '@/services/user'
import RoleService from '@/services/role'
import Utils from '@/services/utils'

import { $t } from '@/boot/i18n'

const PERMISSION_GROUPS = [
    {
        labelKey: 'permGroupAI',
        perms: [
            { value: 'settings:read',   labelKey: 'permViewAISettings' },
            { value: 'settings:update', labelKey: 'permEditAISettings' },
        ],
    },
    {
        labelKey: 'permGroupTemplates',
        perms: [
            { value: 'templates:create', labelKey: 'permCreateTemplates' },
            { value: 'templates:update', labelKey: 'permEditTemplates' },
            { value: 'templates:delete', labelKey: 'permDeleteTemplates' },
        ],
    },
    {
        labelKey: 'permGroupVulnerabilities',
        perms: [
            { value: 'vulnerabilities:create', labelKey: 'permCreateVulnerabilities' },
            { value: 'vulnerabilities:update', labelKey: 'permEditVulnerabilities' },
            { value: 'vulnerabilities:delete', labelKey: 'permDeleteVulnerabilities' },
        ],
    },
    {
        labelKey: 'permGroupAudits',
        perms: [
            { value: 'audits:read-all',   labelKey: 'permReadAllAudits' },
            { value: 'audits:update-all', labelKey: 'permEditAllAudits' },
            { value: 'audits:review',     labelKey: 'permReviewAudits' },
        ],
    },
    {
        labelKey: 'permGroupData',
        perms: [
            { value: 'languages:create',                   labelKey: 'permManageLanguages' },
            { value: 'audit-types:create',                 labelKey: 'permManageAuditTypes' },
            { value: 'vulnerability-types:create',         labelKey: 'permManageVulnTypes' },
            { value: 'vulnerability-categories:create',    labelKey: 'permManageVulnCategories' },
            { value: 'custom-fields:create',               labelKey: 'permManageCustomFields' },
        ],
    },
];

// Labels shown as chips in the table to summarise granted permissions
const PERM_SHORT_LABELS = {
    'settings:read':                    'AI view',
    'settings:update':                  'AI edit',
    'templates:create':                 'Templates',
    'vulnerabilities:create':           'Vulns',
    'audits:read-all':                  'All audits',
    'audits:review':                    'Reviewer',
    'languages:create':                 'Languages',
    'audit-types:create':               'Audit types',
    'vulnerability-types:create':       'Vuln types',
    'vulnerability-categories:create':  'Vuln cats',
    'custom-fields:create':             'Custom fields',
};

function formatDateTimeCell(value) {
    if (!value) return $t('never');
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return $t('never');
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
}

export default {
    data: () => {
        return {
            UserService: UserService,
            collabs: [],
            loading: true,
            dtHeaders: [
                {name: 'username',    label: $t('username'),    field: 'username',    align: 'left', sortable: true},
                {name: 'firstname',   label: $t('firstname'),   field: 'firstname',   align: 'left', sortable: true},
                {name: 'lastname',    label: $t('lastname'),    field: 'lastname',    align: 'left', sortable: true},
                {name: 'email',       label: $t('email'),       field: 'email',       align: 'left', sortable: true},
                {name: 'role',        label: $t('role'),        field: 'role',        align: 'left', sortable: true},
                {name: 'created-at',  label: $t('createdAt'),   field: 'createdAt',   align: 'left', sortable: true, format: formatDateTimeCell, style: 'white-space: nowrap; min-width: 140px'},
                {name: 'last-login',  label: $t('lastLoginAt'), field: 'lastLoginAt', align: 'left', sortable: true, format: formatDateTimeCell, style: 'white-space: nowrap; min-width: 140px'},
                {name: 'permissions', label: $t('permissions'), field: 'permissions', align: 'left', sortable: false},
                {name: 'action',      label: '',                field: 'action',      align: 'left', sortable: false},
            ],
            pagination: {page: 1, rowsPerPage: 25, sortBy: 'username'},
            rowsPerPageOptions: [
                {label:'25', value:25},
                {label:'50', value:50},
                {label:'100', value:100},
                {label:'All', value:0}
            ],
            search: {username: '', firstname: '', lastname: '', role: '', email: '', enabled: true},
            customFilter: Utils.customFilter,
            errors: {lastname: '', firstname: '', username: '', password: ''},
            currentCollab: {
                lastname: '', firstname: '', username: '',
                role: 'user', permissions: [],
                email: '', phone: '', password: '',
                sso: {provider: '', subject: '', email: '', linkedAt: null},
                totpEnabled: false, enabled: true,
            },
            idUpdate: '',
            // Built-in roles plus DB-managed custom roles (Data → Roles)
            baseRoles: [
                {label: 'User', value: 'user'},
                {label: 'Admin', value: 'admin'}
            ],
            permissionGroups: PERMISSION_GROUPS,
            selected: [],
            bulkRoleValue: 'user',
            bulkPermMode: 'grant',
            bulkPermValues: [],
            bulkLoading: false,
        }
    },

    mounted() {
        this.getCollabs();
        this.getRoleOptions();
    },

    methods: {
        getRoleOptions() {
            RoleService.getRoles()
            .then(res => {
                var roles = res.data.datas || [];
                this.baseRoles = roles.map(r => ({label: r.displayName || r.name, value: r.name}));
            })
            .catch(err => console.error(err));
        },

        getCollabs() {
            this.loading = true;
            CollabService.getCollabs()
            .then(data => {
                this.collabs = data.data.datas;
                this.loading = false;
            })
            .catch(err => console.error(err));
        },

        createCollab() {
            this.cleanErrors();
            if (!this.currentCollab.lastname)   this.errors.lastname  = $t('msg.lastnameRequired');
            if (!this.currentCollab.firstname)  this.errors.firstname = $t('msg.firstnameRequired');
            if (!this.currentCollab.username)   this.errors.username  = $t('msg.usernameRequired');
            if (!Utils.strongPassword(this.currentCollab.password))
                this.errors.password = $t('msg.passwordComplexity');

            if (this.errors.lastname || this.errors.firstname || this.errors.username || this.errors.password)
                return;

            const payload = { ...this.currentCollab };
            if (payload.role === 'admin') payload.permissions = [];

            CollabService.createCollab([payload])
            .then(() => {
                this.getCollabs();
                this.$refs.createModal.hide();
                Notify.create({message: $t('msg.userCreatedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
            })
            .catch(err => {
                Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'});
            });
        },

        updateCollab() {
            this.cleanErrors();
            if (!this.currentCollab.lastname)  this.errors.lastname  = $t('msg.lastnameRequired');
            if (!this.currentCollab.firstname) this.errors.firstname = $t('msg.firstnameRequired');
            if (!this.currentCollab.username)  this.errors.username  = $t('msg.usernameRequired');
            if (this.currentCollab.password && !Utils.strongPassword(this.currentCollab.password))
                this.errors.password = $t('msg.passwordComplexity');

            if (this.errors.lastname || this.errors.firstname || this.errors.username || this.errors.password)
                return;

            const payload = { ...this.currentCollab };
            if (payload.role === 'admin') payload.permissions = [];

            CollabService.updateCollab(this.idUpdate, payload)
            .then(() => {
                this.getCollabs();
                this.$refs.editModal.hide();
                Notify.create({message: $t('msg.userUpdatedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
            })
            .catch(err => {
                Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'});
            });
        },

        clone(row) {
            this.currentCollab = {
                ...this.$_.clone(row),
                permissions: Array.isArray(row.permissions) ? [...row.permissions] : [],
                sso: row.sso ? {...row.sso} : {provider: '', subject: '', email: '', linkedAt: null},
                password: '',
            };
            this.idUpdate = row._id;
        },

        cleanErrors() {
            this.errors.lastname = '';
            this.errors.firstname = '';
            this.errors.username = '';
            this.errors.password = '';
        },

        cleanCurrentCollab() {
            this.currentCollab = {
                lastname: '', firstname: '', username: '',
                role: 'user', permissions: [],
                email: '', phone: '', password: '',
                sso: {provider: '', subject: '', email: '', linkedAt: null},
                totpEnabled: false, enabled: true,
            };
        },

        onRoleChange(modal) {
            if (this.currentCollab.role === 'admin') {
                this.currentCollab.permissions = [];
            }
        },

        dblClick(evt, row) {
            if (this.UserService.isAllowed('users:update')) {
                this.clone(row);
                this.$refs.editModal.show();
            }
        },

        selectedIds() {
            return this.selected.map(u => u._id);
        },

        _afterBulk() {
            this.selected = [];
            this.getCollabs();
            Notify.create({message: $t('msg.usersUpdatedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
        },

        _bulkError(err) {
            Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'});
        },

        bulkSetStatus(enabled) {
            var ids = this.selectedIds();
            if (ids.length === 0) return;
            var run = () => {
                this.bulkLoading = true;
                CollabService.bulkStatus(ids, enabled)
                .then(() => this._afterBulk())
                .catch(err => this._bulkError(err))
                .finally(() => { this.bulkLoading = false; });
            };
            if (!enabled) {
                Dialog.create({
                    title: $t('btn.accountsDisabled'),
                    message: $t('msg.bulkDisableConfirm', {count: ids.length}),
                    ok: {label: $t('btn.confirm'), color: 'negative'},
                    cancel: {label: $t('btn.cancel'), color: 'white'}
                }).onOk(run);
            } else {
                run();
            }
        },

        bulkApplyRole() {
            var ids = this.selectedIds();
            if (ids.length === 0 || !this.bulkRoleValue) return;
            this.bulkLoading = true;
            CollabService.bulkRole(ids, this.bulkRoleValue)
            .then(() => {
                this.$refs.bulkRoleModal.hide();
                this._afterBulk();
            })
            .catch(err => this._bulkError(err))
            .finally(() => { this.bulkLoading = false; });
        },

        bulkApplyPermissions() {
            var ids = this.selectedIds();
            if (ids.length === 0 || this.bulkPermValues.length === 0) return;
            var add = this.bulkPermMode === 'grant' ? this.bulkPermValues : [];
            var remove = this.bulkPermMode === 'revoke' ? this.bulkPermValues : [];
            this.bulkLoading = true;
            CollabService.bulkPermissions(ids, add, remove)
            .then(() => {
                this.$refs.bulkPermModal.hide();
                this.bulkPermValues = [];
                this._afterBulk();
            })
            .catch(err => this._bulkError(err))
            .finally(() => { this.bulkLoading = false; });
        },

        summarisePermissions(perms) {
            if (!perms || !perms.length) return [];
            return perms
                .filter(p => PERM_SHORT_LABELS[p])
                .map(p => PERM_SHORT_LABELS[p])
                .slice(0, 4);
        },

        formatDateTime: formatDateTimeCell,
    }
}
