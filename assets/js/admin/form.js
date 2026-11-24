/**
 * form.js — pembangun kolom formulir. makeField(spec, onChange) => { el, get(), set(v), error(msg), input }
 * Tipe: text, email, url, number, textarea, select, checkbox, datetime, color, range, image, imagelist, richtext.
 */
import { h, img as imgEl, isSafeUrl } from '../components.js';
import { createEditor } from './editor.js';
import { pickImage } from './media.js';

let n = 0;
const uid = () => 'fld' + (++n);
const HEX = /^#[0-9A-Fa-f]{6}$/;

function wrap(spec, id, control, extra) {
  const err = h('p', { class: 'field__error', hidden: true, id: id + '-err' });
  const label = spec.type === 'checkbox' ? null : h('label', { class: 'field__label', for: id, text: spec.label + (spec.required ? ' *' : '') });
  const el = h('div', { class: 'field', 'data-field': spec.key }, label, control, spec.hint ? h('p', { class: 'field__hint', id: id + '-hint', text: spec.hint }) : null, err);
  return { el: el, err: err };
}

export function makeField(spec, onChange) {
  const id = uid(), change = () => { if (onChange) onChange(spec.key); };
  let get, set, input, extra;
  switch (spec.type) {
    case 'textarea':
      input = h('textarea', { id: id, class: 'textarea', rows: spec.rows || 4, maxlength: spec.max, placeholder: spec.placeholder });
      get = () => input.value.trim(); set = (v) => { input.value = v == null ? '' : String(v); };
      input.addEventListener('input', change); break;
    case 'select': {
      input = h('select', { id: id, class: 'select' }, (spec.options || []).map((o) => h('option', { value: o[0], text: o[1] })));
      get = () => input.value;
      set = (v) => { v = v == null ? '' : String(v); if (!Array.from(input.options).some((o) => o.value === v)) input.append(h('option', { value: v, text: v || '—' })); input.value = v; };
      input.addEventListener('change', change); break;
    }
    case 'checkbox': {
      input = h('input', { id: id, type: 'checkbox' });
      get = () => input.checked; set = (v) => { input.checked = v === true || String(v).toLowerCase() === 'true'; };
      input.addEventListener('change', change);
      const w = wrap(spec, id, h('label', { class: 'switch', for: id }, input, h('span', { text: spec.label })));
      return { el: w.el, get: get, set: set, input: input, error: (m) => { w.err.textContent = m || ''; w.err.hidden = !m; } };
    }
    case 'datetime':
      input = h('input', { id: id, class: 'input', type: 'datetime-local' });
      get = () => { if (!input.value) return ''; const d = new Date(input.value); return isNaN(d.getTime()) ? '' : d.toISOString(); };
      set = (v) => { const d = new Date(v); input.value = v && !isNaN(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; };
      input.addEventListener('input', change); break;
    case 'color': {
      const pick = h('input', { type: 'color', 'aria-label': spec.label + ' (pemilih warna)' });
      const hex = h('input', { id: id, class: 'input', type: 'text', maxlength: '7', placeholder: '#RRGGBB', autocomplete: 'off', spellcheck: 'false' });
      input = hex;
      get = () => (HEX.test(hex.value) ? hex.value.toUpperCase() : pick.value.toUpperCase());
      set = (v) => { const x = HEX.test(String(v)) ? String(v).toUpperCase() : '#000000'; hex.value = x; pick.value = x.toLowerCase(); hex.removeAttribute('aria-invalid'); };
      pick.addEventListener('input', () => { hex.value = pick.value.toUpperCase(); hex.removeAttribute('aria-invalid'); change(); });
      hex.addEventListener('input', () => { let v = hex.value.trim(); if (v && v[0] !== '#') v = '#' + v; hex.value = v; if (HEX.test(v)) { pick.value = v.toLowerCase(); hex.removeAttribute('aria-invalid'); change(); } else hex.setAttribute('aria-invalid', 'true'); });
      extra = h('div', { class: 'colorfield' }, pick, hex); break;
    }
    case 'range': {
      input = h('input', { id: id, type: 'range', min: spec.min, max: spec.max, step: spec.step || 1 });
      const out = h('output', { for: id });
      const sync = () => { out.textContent = input.value + (spec.unit || ''); };
      get = () => input.value; set = (v) => { input.value = v; sync(); };
      input.addEventListener('input', () => { sync(); change(); });
      extra = h('div', { class: 'rangefield' }, input, out); break;
    }
    case 'image': {
      const url = h('input', { id: id, class: 'input', type: 'text', placeholder: 'https://… atau pilih dari pustaka', maxlength: '1000', autocomplete: 'off' });
      input = url;
      const prev = h('div', { class: 'imgfield__preview', 'aria-hidden': 'true' });
      const draw = () => { const v = url.value.trim(); const i = v && isSafeUrl(v) ? imgEl(v, '', '') : null; prev.replaceChildren(i || h('span', { text: 'Kosong' })); };
      get = () => url.value.trim(); set = (v) => { url.value = v == null ? '' : String(v); draw(); };
      url.addEventListener('input', () => { draw(); change(); });
      extra = h('div', { class: 'imgfield' }, h('div', { class: 'imgfield__row' }, prev,
        h('div', { class: 'imgfield__btns' },
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Pilih / Unggah', onclick: async () => { const u = await pickImage({ folder: spec.folder }); if (u) { set(u); change(); } } }),
          h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Hapus', onclick: () => { set(''); change(); } }))), url);
      break;
    }
    case 'imagelist': {
      let list = [];
      const grid = h('div', { class: 'imglist' });
      const draw = () => grid.replaceChildren(...list.map((u, i) => h('div', { class: 'imglist__item' }, imgEl(u, '', ''), h('button', { type: 'button', class: 'imglist__x', 'aria-label': 'Hapus gambar ' + (i + 1), text: '×', onclick: () => { list.splice(i, 1); draw(); change(); } }))));
      get = () => list.slice();
      set = (v) => {
        let a = v;
        if (!Array.isArray(a)) { const t = String(v || '').trim(); if (!t) a = []; else if (t[0] === '[') { try { a = JSON.parse(t); } catch (e) { a = []; } } else a = t.split(/[\n,]+/); }
        list = a.map((x) => String(x).trim()).filter((x) => x && isSafeUrl(x)); draw();
      };
      input = h('button', { id: id, type: 'button', class: 'btn btn--ghost btn--sm', text: 'Tambah gambar…', onclick: async () => { const us = await pickImage({ folder: spec.folder, multiple: true }); if (us && us.length) { us.forEach((u) => { if (list.indexOf(u) < 0 && list.length < 20) list.push(u); }); draw(); change(); } } });
      extra = h('div', { class: 'imgfield' }, grid, h('div', null, input)); break;
    }
    case 'richtext': {
      const host = h('div', { id: id });
      const ed = createEditor(host, { mini: spec.mini, placeholder: spec.placeholder, onChange: change, pickImage: spec.mini ? null : () => pickImage({ folder: spec.folder }) });
      input = host;
      get = () => (ed ? ed.getHtml() : ''); set = (v) => { if (ed) ed.setHtml(v); };
      extra = host; break;
    }
    default: {
      const type = spec.type === 'url' ? 'text' : (spec.type || 'text');
      input = h('input', { id: id, class: 'input', type: type, maxlength: spec.max, placeholder: spec.placeholder, autocomplete: 'off', list: spec.datalist ? id + '-dl' : null, min: spec.min, max: type === 'number' ? spec.maxValue : null, inputmode: spec.type === 'number' ? 'numeric' : null, pattern: spec.pattern ? spec.pattern.source : null });
      get = () => input.value.trim(); set = (v) => { input.value = v == null ? '' : String(v); };
      input.addEventListener('input', change);
      if (spec.datalist) extra = h('div', null, input, h('datalist', { id: id + '-dl' }, spec.datalist.map((d) => h('option', { value: d }))));
    }
  }
  const w = wrap(spec, id, extra || input);
  if (spec.hint) input.setAttribute('aria-describedby', id + '-hint');
  return {
    el: w.el, get: get, set: set, input: input,
    error: (m) => { w.err.textContent = m || ''; w.err.hidden = !m; if (input.setAttribute) { if (m) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); } }
  };
}
