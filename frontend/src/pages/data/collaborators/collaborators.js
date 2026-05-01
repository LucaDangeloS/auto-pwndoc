import { Dialog, Notify } from 'quasar';

import CollabService from '@/services/collaborator'
import UserService from '@/services/user'
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
                totpEnabled: false, enabled: true,
            },
            idUpdate: '',
            // Only the two built-in base roles are selectable; custom roles (from roles.json)
            // are intentionally excluded here since they are managed via config file.
            baseRoles: ['user', 'admin'],
            permissionGroups: PERMISSION_GROUPS,
        }
    },

    mounted() {
        this.getCollabs();
    },

    methods: {
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
                Notify.create({message: $t('msg.collaboratorCreatedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
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
                Notify.create({message: $t('msg.collaboratorUpdatedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
            })
            .catch(err => {
                Notify.create({message: err.response.data.datas, color: 'negative', textColor: 'white', position: 'top-right'});
            });
        },

        clone(row) {
            this.currentCollab = {
                ...this.$_.clone(row),
                permissions: Array.isArray(row.permissions) ? [...row.permissions] : [],
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

        summarisePermissions(perms) {
            if (!perms || !perms.length) return [];
            return perms
                .filter(p => PERM_SHORT_LABELS[p])
                .map(p => PERM_SHORT_LABELS[p])
                .slice(0, 4);
        },
    }
}
