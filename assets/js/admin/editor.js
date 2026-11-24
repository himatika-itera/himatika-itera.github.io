/**
 * editor.js — pembungkus Quill 1.3.7 (disimpan lokal di assets/vendor/quill, bukan CDN).
 * Hanya format yang diizinkan sanitizer server yang ditawarkan (H2–H4, tebal/miring/garis, daftar, kutipan,
 * kode, tautan, gambar). Server dan situs publik tetap menyanitasi ulang HTML apa pun yang tersimpan.
 */
import { h } from '../components.js';

export function createEditor(host, opts) {
  const o = opts || {};
  if (!window.Quill) { host.append(h('p', { class: 'alert alert--error', text: 'Editor gagal dimuat (assets/vendor/quill). Muat ulang halaman.' })); return null; }
  const toolbar = o.mini
    ? [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']]
    : [[{ header: [2, 3, 4, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'code-block'], ['link', 'image'], ['clean']];
  const box = h('div', { class: 'editor-box' + (o.mini ? ' editor-box--mini' : '') });
  const mount = h('div'); box.append(mount); host.append(box);
  const quill = new window.Quill(mount, { theme: 'snow', placeholder: o.placeholder || 'Tulis di sini…', modules: { toolbar: toolbar } });
  if (!o.mini && o.pickImage) {
    quill.getModule('toolbar').addHandler('image', async () => {
      const range = quill.getSelection(true) || { index: quill.getLength() };
      const url = await o.pickImage();
      if (url) { quill.insertEmbed(range.index, 'image', url, 'user'); quill.setSelection(range.index + 1, 0, 'silent'); }
    });
  }
  quill.on('text-change', (delta, old, source) => { if (source === 'user' && o.onChange) o.onChange(); });
  return {
    quill: quill,
    getHtml() { const t = quill.getText().trim(), html = quill.root.innerHTML; return t === '' && html.indexOf('<img') < 0 ? '' : html; },
    setHtml(html) { quill.setContents(quill.clipboard.convert(html || ''), 'silent'); },
    focus() { quill.focus(); }
  };
}
