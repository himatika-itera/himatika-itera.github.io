import { bootAdmin } from './shell.js'; import { mountMediaPage } from './media.js';
bootAdmin({ title: 'Media', perm: 'media:read', current: 'media', render: (c) => mountMediaPage(c) });
