import { bootAdmin } from './shell.js'; import { mountResource } from './crud.js'; import { NEWS } from './resources.js';
bootAdmin({ title: 'Berita', perm: 'news:read', current: 'news', render: (c) => mountResource(c, NEWS) });
