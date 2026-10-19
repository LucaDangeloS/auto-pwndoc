'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const audits = source('pages', 'audits', 'list', 'audits-list.html');
const vulnerabilities = source('pages', 'vulnerabilities', 'vulnerabilities.html');
const dataNavigation = source('pages', 'data', 'index.vue');
const customData = source('pages', 'data', 'custom', 'custom.html');
const routes = source('router', 'routes.js');

assert(
    audits.includes('href="/data/vulnerabilities-data"') &&
        audits.includes('href="/data/audits-data"') &&
        vulnerabilities.includes('href="/data/vulnerabilities-data"'),
    'missing setup links must open the dedicated Languages and Audit Data pages'
);

assert(
    dataNavigation.includes("to='/data/vulnerabilities-data'") &&
        dataNavigation.includes("<q-item-section>{{$t('languages')}}</q-item-section>") &&
        !dataNavigation.includes("to='/data/companies'") &&
        !dataNavigation.includes("$t('vulnerabilityData')"),
    'Data navigation must expose Languages directly and omit the duplicate Companies page'
);

assert(
    customData.includes("<q-tabs v-if=\"section !== 'vulnerabilities'\"") &&
        !customData.includes("<q-tab v-if=\"section === 'vulnerabilities'\""),
    'the Languages page must not render a redundant sub-tab bar'
);

assert(
    routes.includes("{path: 'companies', redirect: '/clients'}") &&
        routes.includes("{path: 'companies/:companyId', redirect: to => `/clients/${to.params.companyId}`}") &&
        routes.includes("{path: 'clients', component: () => import('@/pages/data/companies')"),
    'legacy Companies URLs must redirect to the canonical Clients pages'
);

console.log('Data navigation regression tests passed');
