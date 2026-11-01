function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  );
}
const segmenter = new Intl.Segmenter('nl', { granularity: 'grapheme' });
function previewText(value, limit) {
  let result = '';
  let count = 0;
  for (const { segment } of segmenter.segment(String(value || ''))) {
    if (count++ === limit) return result + '…';
    result += segment;
  }
  return result;
}
module.exports = { escapeHtml, previewText };
