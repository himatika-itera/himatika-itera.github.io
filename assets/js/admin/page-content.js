import { bootAdmin } from './shell.js'; import { mountResource } from './crud.js'; import { STRUKTUR, NAVIGATION } from './resources.js';
import { h } from '../components.js'; import { can } from '../auth.js';
bootAdmin({ title: 'Kabinet & Navigasi', perm: 'struktur:read', current: 'content', render: (c) => {
  const tabs = [['struktur', 'Struktur kabinet', STRUKTUR, 'struktur:read'], ['nav', 'Menu navigasi', NAVIGATION, 'navigation:update']].filter((t) => can(t[3]));
  const pane = h('div'), bar = h('div', { class: 'tabs', role: 'tablist' });
  const show = (i) => { bar.querySelectorAll('.tab').forEach((b, j) => b.setAttribute('aria-selected', String(i === j))); const t = tabs[i]; const note = t[2].note; const inner = h('div'); pane.replaceChildren(...[note ? h('p', { class: 'muted', text: note }) : null, inner].filter(Boolean)); mountResource(inner, t[2]); };
  tabs.forEach((t, i) => bar.append(h('button', { type: 'button', class: 'tab', role: 'tab', text: t[1], onclick: () => show(i) })));
  c.replaceChildren(bar, pane); show(0);
} });
