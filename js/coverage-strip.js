/* Renders <div data-coverage-strip> as a compact "who supports doula services" list. Needs coverage-data.js. */
(function () {
  function render() {
    const C = window.DHCoverage;
    if (!C) return;
    document.querySelectorAll('[data-coverage-strip]').forEach((el) => {
      const esc = (window.DH && DH.esc) || String;
      const ic = { yes: 'check', some: 'info', varies: 'alert' };
      el.innerHTML = `<div class="cov-strip"><div class="cov-strip-chips">${C.INSURERS.map((i) => `<a class="chip ${C.LABEL[i.status].cls}" href="coverage.html?insurer=${i.id}#check" title="${esc(C.LABEL[i.status].t)} — ${esc(i.headline)}">${window.DH ? DH.icon(ic[i.status]) : ''}${esc(i.name.replace(/ \(.*\)/, ''))}</a>`).join('')}</div>
      <p class="xs" style="margin:10px 0 0;opacity:.85"><span class="chip ok" style="height:20px;font-size:.62rem">Supports</span> <span class="chip info" style="height:20px;font-size:.62rem">Select plans</span> <span class="chip warn" style="height:20px;font-size:.62rem">Varies</span> · Reviewed ${new Date(C.REVIEWED + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · coverage varies by state and plan — <a href="coverage.html" style="text-decoration:underline">see the details</a></p></div>`;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
