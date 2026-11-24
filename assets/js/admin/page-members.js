import { bootAdmin } from './shell.js'; import { mountResource } from './crud.js'; import { MEMBERS } from './resources.js';
bootAdmin({ title: 'Anggota', perm: 'members:read', current: 'members', render: (c) => mountResource(c, MEMBERS) });
