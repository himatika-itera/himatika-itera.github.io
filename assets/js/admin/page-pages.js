import { bootAdmin } from './shell.js'; import { mountResource } from './crud.js'; import { PAGES } from './resources.js';
bootAdmin({ title: 'Halaman', perm: 'pages:read', current: 'pages', render: (c) => mountResource(c, PAGES) });
