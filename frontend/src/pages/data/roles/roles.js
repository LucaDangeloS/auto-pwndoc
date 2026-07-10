import { Dialog, Notify } from 'quasar';

import RoleService from '@/services/role'
import UserService from '@/services/user'

import { $t } from '@/boot/i18n'

export default {
    data: () => {
        return {
            UserService: UserService,
            roles: [],
            catalog: [],
            loading: true,
            dtHeaders: [
                {name: 'displayName', label: $t('roleDisplayName'), field: 'displayName', align: 'left', sortable: true},
                {name: 'name',        label: $t('roleName'),        field: 'name',        align: 'left', sortable: true},
                {name: 'description', label: $t('description'),     field: 'description', align: 'left', sortable: false},
                {name: 'users',       label: $t('users'),           field: 'users',       align: 'left', sortable: true},
                {name: 'permissions', label: $t('permissions'),     field: 'allows',      align: 'left', sortable: false},
                {name: 'action',      label: '',                    field: 'action',      align: 'left', sortable: false},
            ],
            pagination: {page: 1, rowsPerPage: 25, sortBy: 'displayName'},
            currentRole: {
                name: '', displayName: '', description: '',
                allows: [], inherits: [],
            },
            inheritUser: true,
            editMode: false,
            viewOnly: false,
            errors: {name: '', displayName: ''},
            saving: false,
        }
    },

    computed: {
        corePermissions() {
            var user = this.roles.find(r => r.name === 'user' && r.system);
            return (user && Array.isArray(user.allows)) ? user.allows : [];
        },
    },

    mounted() {
        this.getRoles();
        RoleService.getPermissionsCatalog()
        .then(res => { this.catalog = res.data.datas || []; })
        .catch(err => console.error(err));
    },

    methods: {
        getRoles() {
            this.loading = true;
            RoleService.getRoles()
            .then(res => {
                this.roles = res.data.datas || [];
                this.loading = false;
            })
            .catch(err => console.error(err));
        },

        cleanErrors() {
            this.errors.name = '';
            this.errors.displayName = '';
        },

        openCreate() {
            this.cleanErrors();
            this.editMode = false;
            this.viewOnly = false;
            this.inheritUser = true;
            this.currentRole = {name: '', displayName: '', description: '', allows: [], inherits: ['user']};
            this.$refs.roleModal.show();
        },

        openEdit(row) {
            this.cleanErrors();
            this.editMode = true;
            this.viewOnly = !!row.system || !UserService.isAllowed('roles:update');
            this.inheritUser = Array.isArray(row.inherits) && row.inherits.includes('user');
            this.currentRole = {
                name: row.name,
                displayName: row.displayName,
                description: row.description || '',
                allows: row.allows === '*' ? [] : [...(row.allows || [])],
                inherits: Array.isArray(row.inherits) ? [...row.inherits] : [],
                system: !!row.system,
                allowsAll: row.allows === '*',
            };
            this.$refs.roleModal.show();
        },

        // A permission is effectively granted when explicitly in allows or
        // implied by inheriting the base user role.
        isImplied(scope) {
            if (this.currentRole.allowsAll) return true;
            return this.inheritUser && this.corePermissions.includes(scope);
        },

        isChecked(scope) {
            return this.isImplied(scope) || this.currentRole.allows.includes(scope);
        },

        togglePermission(scope, value) {
            if (this.isImplied(scope) || this.viewOnly) return;
            if (value && !this.currentRole.allows.includes(scope))
                this.currentRole.allows.push(scope);
            else if (!value)
                this.currentRole.allows = this.currentRole.allows.filter(p => p !== scope);
        },

        saveRole() {
            this.cleanErrors();
            if (!this.currentRole.displayName.trim()) this.errors.displayName = $t('msg.fieldRequired');
            if (!this.editMode && !/^[a-zA-Z0-9_-]+$/.test(this.currentRole.name)) this.errors.name = $t('roleNameInvalid');
            if (this.errors.name || this.errors.displayName) return;

            var payload = {
                name: this.currentRole.name,
                displayName: this.currentRole.displayName.trim(),
                description: this.currentRole.description,
                allows: this.currentRole.allows,
                inherits: this.inheritUser ? ['user'] : []
            };

            this.saving = true;
            var request = this.editMode
                ? RoleService.updateRole(this.currentRole.name, payload)
                : RoleService.createRole(payload);

            request
            .then(() => {
                this.$refs.roleModal.hide();
                this.getRoles();
                Notify.create({message: $t('msg.roleSavedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
            })
            .catch(err => {
                Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'});
            })
            .finally(() => { this.saving = false; });
        },

        confirmDelete(row) {
            Dialog.create({
                title: $t('msg.confirmSuppression'),
                message: $t('msg.roleDeleteConfirm', {name: row.displayName, count: row.users}),
                ok: {label: $t('btn.confirm'), color: 'negative'},
                cancel: {label: $t('btn.cancel'), color: 'white'}
            })
            .onOk(() => {
                RoleService.deleteRole(row.name)
                .then(() => {
                    this.getRoles();
                    Notify.create({message: $t('msg.roleDeletedOk'), color: 'positive', textColor: 'white', position: 'top-right'});
                })
                .catch(err => {
                    Notify.create({message: err.response?.data?.datas || err.message, color: 'negative', textColor: 'white', position: 'top-right'});
                });
            });
        },

        permissionsSummary(row) {
            if (row.allows === '*') return $t('allPermissions');
            var count = (row.allows || []).length;
            var inheritsUser = Array.isArray(row.inherits) && row.inherits.includes('user');
            if (inheritsUser) return $t('rolePermissionsSummaryInherits', {count: count});
            return $t('rolePermissionsSummary', {count: count});
        },
    }
}
