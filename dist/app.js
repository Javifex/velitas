import { STATUS_LABELS, parseNumber, moneyToCents, calculateEstimate, orderTotals, validateOrder } from './domain.js';
import { STORAGE_KEY, loadOrders, saveOrders, exportBackup, importBackup } from './storage.js';

const paths = {
  orders: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M9 5V3h6v2M8 11h8M8 15h5"/>',
  calculator: '<rect x="5" y="3" width="14" height="19" rx="3"/><path d="M8 7h8M8 11h1m3 0h1m3 0h.1M8 15h1m3 0h1m3 0h.1M8 18h1m3 0h1m3 0h.1"/>',
  sparkles: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM20 2v4m-2-2h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  wallet: '<path d="M20 8H6a3 3 0 0 1 0-6h12v6M3 5v13a3 3 0 0 0 3 3h14V8M20 12h-5v5h5"/>',
  trend: '<path d="m3 17 6-6 4 4 8-10M15 5h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  candle: '<path d="M8 10h8v11H8zM12 10V7c-4-1-2-5 0-6 3 3 4 5 0 6M6 21h12"/>',
  drop: '<path d="M12 2C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-13Z"/><path d="M9 16c0 2 1 3 3 3"/>',
  truck: '<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h2c2 0 3-3 1-4-2-1-1-3 1-3h2c5-1 1-11-6-11Z"/><path d="M7 10h.1M10 7h.1M15 8h.1M7 15h.1"/>',
  flower: '<path d="M12 9C5 0 0 8 9 12c-9 4-4 12 3 3 7 9 12 1 3-3 9-4 4-12-3-3Z"/><circle cx="12" cy="12" r="2"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M8 5l9 4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  edit: '<path d="m16 3 5 5L8 21H3v-5L16 3ZM13 6l5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.box}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = selector => document.querySelector(selector);
const main = $('#main');
const modal = $('#modal');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const currencyWithCents = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = cents => (cents % 100 ? currencyWithCents : currency).format(cents / 100);
const rawMoney = cents => String(cents / 100);
const number = value => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
const dateLabel = date => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
const normalized = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const initialDraft = () => ({ quantity: '1', gramsPerUnit: '', waxPricePerKg: '', transport: '', dye: '', fragrance: '', wick: '', molds: '', salePerUnit: '' });
let orders = [], locked = false, snapshot = null, search = '', filter = 'todos', calcDraft = initialDraft(), toastTimer, deferredInstall;
let orderFormContext = null, importedOrders = null, modalSnapshot = null;

try {
  snapshot = localStorage.getItem(STORAGE_KEY);
  orders = loadOrders();
} catch {
  locked = true;
  $('#storage-alert').textContent = 'No pudimos abrir los datos guardados. Para protegerlos, no se harán cambios. Abre «Mis datos y respaldo» para descargar los datos originales o restaurar un respaldo.';
  $('#storage-alert').hidden = false;
}

function toast(message, error = false) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 8000 : 4000);
}

function persist(next, restoring = false) {
  if (locked && !restoring) throw new Error('Los datos están protegidos. Restaura un respaldo antes de hacer cambios.');
  // shortcut: los datos viven en este dispositivo; añadir sincronización al ofrecer cuentas comerciales.
  if (localStorage.getItem(STORAGE_KEY) !== snapshot || (modal.open && modalSnapshot !== snapshot)) {
    orders = loadOrders();
    snapshot = localStorage.getItem(STORAGE_KEY);
    render();
    throw new Error('Los pedidos cambiaron en otra pestaña. Cierra este formulario y ábrelo de nuevo para usar los datos actuales.');
  }
  saveOrders(next);
  orders = loadOrders();
  snapshot = localStorage.getItem(STORAGE_KEY);
  locked = false;
  $('#storage-alert').hidden = true;
  $('#nav-count').textContent = String(orders.length);
}

function statusBadge(status) { return `<span class="status ${status}">${STATUS_LABELS[status]}</span>`; }
function profitClass(value) { return value < 0 ? 'loss' : 'profit'; }
function marginLabel(value) { return value === null ? 'Sin precio de venta' : `${number(value)} % de margen`; }
function totalValues() {
  return orders.reduce((sum, order) => ({ revenue: sum.revenue + order.totalPrice, profit: sum.profit + orderTotals(order).profit }), { revenue: 0, profit: 0 });
}
function heading(title, eyebrow, copy, actions = '', extraClass = '') {
  return `<div class="page-heading ${extraClass}"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
}
function heroArt() {
  return `<svg class="hero-art" viewBox="0 0 260 190" aria-hidden="true"><ellipse cx="143" cy="178" rx="101" ry="10" fill="#d5c7de" opacity=".5"/><path d="M226 174c-1-31 14-56 9-82" fill="none" stroke="#a9a489" stroke-width="1.5"/><path d="M229 148c-19-5-27-17-25-27 15 0 25 14 25 27m5-23c15-7 21-17 18-25-12 2-19 13-18 25m2-26c-13-6-17-17-13-23 10 4 14 13 13 23" fill="#b7b39d"/><rect x="64" y="96" width="65" height="79" rx="7" fill="#c39e8e"/><path d="M64 103h65v13c-7 3-8-7-14-3s-6 12-14 5-9 0-16-5-12 8-21 0Z" fill="#d6b4a4"/><ellipse cx="96.5" cy="97" rx="32.5" ry="7" fill="#ead1be"/><path d="M97 97V81" stroke="#856d5c" stroke-width="2"/><path d="M97 83c-16-3-12-15 0-27 3 10 17 22 0 27" fill="#d7ac73"/><path d="M98 80c-6-2-5-8 0-14 2 5 6 11 0 14" fill="#f8e5b7"/><rect x="137" y="65" width="64" height="111" rx="6" fill="#f3e5d1"/><path d="M137 73h64v22c-6 1-8-9-13-3s-8-4-13 1-10-1-13-6-7 3-10-1-9-4-15-3Z" fill="#e4cdb0"/><ellipse cx="169" cy="66" rx="32" ry="7" fill="#fbf1df"/><path d="M169 67V49" stroke="#a78a69" stroke-width="2"/><path d="M170 52c-20-4-12-21-1-37 6 15 21 32 1 37" fill="#d6ac71"/><path d="M170 47c-8-3-4-12 0-18 4 7 8 15 0 18" fill="#f7dfac"/><rect x="154" y="112" width="30" height="37" rx="1" fill="#fffaf1" opacity=".85"/><path d="M162 122h14m-14 5h14m-11 5h8" stroke="#c5b497" stroke-width="1"/><path d="m52 66 2-6 2 6 6 2-6 2-2 6-2-6-6-2 6-2m158-34 1-4 2 4 4 2-4 1-2 4-1-4-4-1 4-2" fill="#b5a3bf"/><circle cx="40" cy="105" r="2" fill="#b7a3be"/></svg>`;
}

function renderOrders() {
  const totals = totalValues();
  const active = orders.filter(order => order.status !== 'completado').length;
  main.innerHTML = `${heading('Mis pedidos', 'CADA PEDIDO, UNA NUEVA CHISPA', 'Todo lo que estás creando, en un solo lugar.', `<button class="button primary" data-action="new-order">${icon('plus')}Nuevo pedido</button>`)}
    <section class="stats" aria-label="Resumen de todos los pedidos">
      <div class="stat"><div><span class="stat-label">Pedidos activos</span><strong class="stat-value">${active}</strong><small>${orders.length} pedido${orders.length === 1 ? '' : 's'} en total</small></div><span class="stat-icon">${icon('orders')}</span></div>
      <div class="stat"><div><span class="stat-label">Ventas previstas</span><strong class="stat-value">${money(totals.revenue)}</strong><small>Valor de todos los pedidos</small></div><span class="stat-icon">${icon('wallet')}</span></div>
      <div class="stat"><div><span class="stat-label">Ganancia prevista</span><strong class="stat-value ${profitClass(totals.profit)}">${money(totals.profit)}</strong><small>Ventas menos costos registrados</small></div><span class="stat-icon">${icon('trend')}</span></div>
    </section>
    <section class="hero"><div><div class="eyebrow">DE TU TALENTO A TUS CUENTAS</div><h2>Que tus ideas brillen.<br>Y tus números también.</h2><p>Calcula lo que cuesta crear y ponle un precio<br class="desktop-break"> que valore tu trabajo.</p><a class="button ghost" href="#costos">Calcular un nuevo lote ${icon('arrow')}</a></div>${heroArt()}</section>
    <section class="list-section" aria-label="Lista de pedidos"><div class="section-heading"><h2>Tu mesa de trabajo</h2><small id="result-count"></small></div>
      <div class="list-tools"><label class="search">${icon('search')}<input id="order-search" type="search" placeholder="Buscar por nombre del cliente" aria-label="Buscar por nombre del cliente" value="${escapeHTML(search)}"></label>
      <div class="filters" aria-label="Filtrar por estado">${[['todos', 'Todos'], ...Object.entries(STATUS_LABELS)].map(([key, label]) => `<button class="filter ${filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join('')}</div></div>
      <div class="table-head" aria-hidden="true"><span>Cliente / pedido</span><span>Estado</span><span class="cost-column">Costo</span><span>Ganancia</span><span></span></div>
      <div id="order-list"></div><div class="list-bottom"><span id="list-count"></span><span>Todos los valores en COP</span></div></section>
    <div class="tip-line">${icon('shield')}Tus pedidos se guardan en este dispositivo. Haz un respaldo para conservarlos.</div>`;
  updateOrderList();
}

function updateOrderList() {
  const query = normalized(search);
  const visible = orders.filter(order => (!query || normalized(order.client).includes(query)) && (filter === 'todos' || order.status === filter)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $('#result-count').textContent = `${visible.length} pedido${visible.length === 1 ? '' : 's'}`;
  $('#list-count').textContent = `${visible.length} de ${orders.length} pedidos`;
  $('#order-list').innerHTML = visible.length ? visible.map(order => {
    const totals = orderTotals(order);
    const initials = order.client.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase('es');
    return `<a class="order-row" href="#pedido/${encodeURIComponent(order.id)}" aria-label="Abrir pedido de ${escapeHTML(order.client)}. ${STATUS_LABELS[order.status]}">
      <span class="order-client"><span class="client-avatar" aria-hidden="true">${escapeHTML(initials)}</span><span class="client-text"><strong>${escapeHTML(order.client)}</strong><small>${escapeHTML(order.description || `${order.quantity} vela${order.quantity === 1 ? '' : 's'}`)}</small></span></span>
      <span class="status-column">${statusBadge(order.status)}</span><span class="row-money cost-column">${money(totals.cost)}</span><span class="row-money profit-column ${profitClass(totals.profit)}">${money(totals.profit)}</span><span class="row-arrow" aria-hidden="true">›</span></a>`;
  }).join('') : `<div class="empty-state"><span class="empty-icon">${icon(orders.length ? 'search' : 'candle')}</span><h3>${orders.length ? 'No encontramos pedidos' : 'Aquí comienza algo bonito'}</h3><p>${orders.length ? 'Prueba con otro nombre o cambia el filtro de estado.' : 'Crea tu primer pedido y lleva cada costo, cada detalle y cada ganancia con calma.'}</p>${orders.length ? '<button class="button secondary" data-action="clear-search">Ver todos los pedidos</button>' : `<button class="button secondary" data-action="new-order">${icon('plus')}Crear mi primer pedido</button>`}</div>`;
  document.querySelectorAll('[data-action="filter"]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  });
}

function numericField(name, label, value, unit = 'COP', hint = '', placeholder = '0', required = false) {
  return `<label class="field"><span>${label}</span><span class="input-unit">${unit === 'COP' ? '<span class="prefix">$</span>' : ''}<input name="${name}" type="text" inputmode="decimal" autocomplete="off" maxlength="20" value="${escapeHTML(value)}" placeholder="${placeholder}" ${required ? 'required' : ''}><span>${unit}</span></span>${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function renderCalculator() {
  main.innerHTML = `${heading('Calculadora de costos', 'ANTES DE ENCENDER LA PRIMERA VELA', 'Cada ingrediente cuenta. Dale valor a lo que creas.', '<button class="button secondary" data-action="reset-calc">Limpiar</button>', 'estimate-heading')}
    <div class="calc-intro">${icon('info')}<span>La cera se calcula según los gramos de cada vela. Los demás valores corresponden al <strong>lote completo</strong>. Escribe los importes sin puntos de miles; puedes usar coma decimal.</span></div>
    <div class="estimate-layout"><form id="calc-form" class="estimate-columns" novalidate>
      <section class="panel"><div class="panel-heading"><h2><span class="number">01</span>Tu próximo lote</h2><span class="muted">${icon('candle')}</span></div><div class="form-grid">
        ${numericField('quantity', 'Cantidad de velas', calcDraft.quantity, 'und.', '', 'Ej. 20', true)}
        ${numericField('gramsPerUnit', 'Gramaje por vela', calcDraft.gramsPerUnit, 'g', 'Gramos de cera para una sola vela', 'Ej. 120', true)}
        ${numericField('waxPricePerKg', 'Costo del kilo de cera', calcDraft.waxPricePerKg, 'COP/kg', 'Precio que pagas por 1.000 gramos', 'Ej. 24000')}
        ${numericField('salePerUnit', 'Precio de venta por vela', calcDraft.salePerUnit, 'COP', 'Opcional, para estimar tu ganancia', 'Ej. 15000')}
      </div><p class="field-note">Cera del lote = (gramos por vela × cantidad ÷ 1.000) × costo del kilo.</p></section>
      <section class="panel"><div class="panel-heading"><h2><span class="number">02</span>Los ingredientes del costo</h2></div><div class="material-grid">
        ${numericField('transport', `${icon('truck')} Transportes`, calcDraft.transport, 'COP', 'Transporte de insumos y entregas')}
        ${numericField('dye', `${icon('palette')} Colorante`, calcDraft.dye, 'COP', 'Costo de la cantidad que usarás')}
        ${numericField('fragrance', `${icon('flower')} Aromatizante`, calcDraft.fragrance, 'COP', 'Esencia para todas las velas')}
        ${numericField('wick', `${icon('candle')} Pabilo`, calcDraft.wick, 'COP', 'Pabilos para el lote completo')}
        ${numericField('molds', `${icon('box')} Moldes`, calcDraft.molds, 'COP', 'Costo de uso asignado a este lote')}
      </div><p class="field-note">¿Empaques, mano de obra u otro gasto? Puedes añadirlos al crear el pedido. En moldes incluye solo el valor que quieras recuperar con este lote.</p></section>
    </form><aside class="panel summary" aria-label="Resultado del cálculo" id="estimate-result" aria-live="polite"></aside></div>`;
  updateEstimate();
}

function currentEstimate() { return calculateEstimate(calcDraft); }
function updateEstimate() {
  let estimate, message = '';
  try { estimate = currentEstimate(); } catch (error) { message = error.message; }
  const result = $('#estimate-result');
  if (!result) return;
  result.innerHTML = `<div class="eyebrow">LAS CUENTAS, CLARAS</div><h2>Tu lote en números</h2><div class="big-total">${money(estimate?.totalCost || 0)}</div><p class="per-unit">${estimate ? `${money(estimate.unitCost)} por vela · ${number(estimate.quantity)} unidades` : 'Completa el gramaje y la cantidad para empezar'}</p><div class="divider"></div>
    ${estimate ? estimate.costs.map(item => `<div class="summary-row"><span>${item.label}</span><strong>${money(item.amount)}</strong></div>`).join('') : '<p class="summary-note">Añade los materiales que usarás.<br>Nosotros hacemos las cuentas.</p>'}
    <div class="divider"></div><div class="summary-row"><span>Venta del lote</span><strong>${money(estimate?.revenue || 0)}</strong></div><div class="summary-row highlight"><span>Ganancia estimada</span><strong class="${profitClass(estimate?.profit || 0)}">${money(estimate?.profit || 0)}</strong></div>
    ${estimate ? `<p class="per-unit">${marginLabel(estimate.margin)}</p>` : ''}
    ${estimate?.profit < 0 ? '<p class="negative-hint">Con este precio, el lote genera pérdida. Revisa el precio de venta o los costos.</p>' : ''}
    <button class="button primary" data-action="estimate-order" ${estimate ? '' : 'disabled'}>${icon('plus')}Crear pedido con este cálculo</button><p class="summary-note">Los costos pasan al pedido.<br>Podrás ajustarlos cuando lo necesites.</p>
    ${message ? `<p class="inline-message">${escapeHTML(message)}</p>` : ''}`;
}

function selectedOrder() {
  const id = location.hash.slice('#pedido/'.length);
  try { return orders.find(order => order.id === decodeURIComponent(id)); } catch { return undefined; }
}

function renderDetail(order) {
  const totals = orderTotals(order);
  main.innerHTML = `<a href="#pedidos" class="back-link">${icon('back')}Volver a mis pedidos</a>
    ${heading(escapeHTML(order.client), 'LOS DETALLES HACEN LA DIFERENCIA', escapeHTML(order.description || `${order.quantity} vela${order.quantity === 1 ? '' : 's'} hechas con cariño`), `<button class="button secondary" data-action="edit-order">${icon('edit')}Editar pedido</button>`, 'detail-heading detail-title')}
    <div class="detail-grid"><div><section class="panel"><div class="panel-heading"><h2>Así va este pedido</h2>${statusBadge(order.status)}</div>
      <div class="order-meta"><span>${number(order.quantity)} vela${order.quantity === 1 ? '' : 's'}</span><span>Creado ${dateLabel(order.createdAt.slice(0, 10))}</span>${order.dueDate ? `<span class="date-chip">Entrega ${dateLabel(order.dueDate)}</span>` : ''}</div>
      <div class="status-control"><span>Estado actual · toca para cambiar</span><div class="status-steps" aria-label="Estado del pedido">${Object.entries(STATUS_LABELS).map(([key, label]) => `<button data-action="status" data-status="${key}" class="${key === order.status ? 'active' : ''}" aria-pressed="${key === order.status}">${label}</button>`).join('')}</div></div>
      <div class="save-indicator">${icon('check')}Guardado en este dispositivo</div></section>
      <section class="panel"><div class="panel-heading"><h2>Costos de ejecución</h2><small>${order.costs.length} concepto${order.costs.length === 1 ? '' : 's'}</small></div>
      ${order.costs.length ? order.costs.map(item => `<div class="cost-line"><span class="cost-icon">${icon(item.id === 'cera' ? 'drop' : 'box')}</span><span class="cost-name">${escapeHTML(item.label)}</span><strong>${money(item.amount)}</strong><button class="remove-cost" data-action="edit-cost" data-cost="${escapeHTML(item.id)}" aria-label="Editar costo ${escapeHTML(item.label)}">${icon('edit')}</button><button class="remove-cost" data-action="remove-cost" data-cost="${escapeHTML(item.id)}" aria-label="Eliminar costo ${escapeHTML(item.label)}">${icon('trash')}</button></div>`).join('') : '<p class="details-notes">Aún no has registrado costos. Añade los materiales, empaques y tu tiempo de trabajo.</p>'}
      <div class="cost-total"><span>Costo total del pedido</span><strong>${money(totals.cost)}</strong></div>
      <form id="add-cost-form" class="add-cost-form"><label class="field"><span>Nuevo concepto</span><input name="label" placeholder="Ej. Empaques" maxlength="100" required></label><label class="field"><span>Valor total (COP)</span><input name="amount" type="text" inputmode="decimal" placeholder="Ej. 5000" maxlength="20" required></label><button class="button primary" aria-label="Añadir costo">${icon('plus')}</button></form><p id="cost-error" class="inline-message form-error" role="alert"></p>
      </section>${order.notes ? `<section class="panel"><div class="panel-heading"><h2>Notas del pedido</h2></div><p class="details-notes">${escapeHTML(order.notes)}</p></section>` : ''}
      <div class="danger-zone"><button class="button ghost loss" data-action="delete-order">${icon('trash')}Eliminar pedido</button></div></div>
      <aside class="panel summary"><div class="eyebrow">EL VALOR DE TU TRABAJO</div><h2>Resumen del pedido</h2><p class="summary-note" style="text-align:left">Precio de venta total</p><div class="big-total">${money(order.totalPrice)}</div><p class="per-unit">${money(Math.round(order.totalPrice / order.quantity))} por vela · ${number(order.quantity)} unidades</p><div class="divider"></div>
      <div class="summary-row"><span>Venta del pedido</span><strong>${money(order.totalPrice)}</strong></div><div class="summary-row"><span>Costo de ejecución</span><strong>${money(totals.cost)}</strong></div><div class="summary-row highlight"><span>Tu ganancia</span><strong class="${profitClass(totals.profit)}">${money(totals.profit)}</strong></div><p class="per-unit">${marginLabel(totals.margin)}</p>
      ${totals.profit < 0 ? '<p class="negative-hint">Los costos superan la venta. Este pedido genera pérdida con los valores actuales.</p>' : ''}
      <p class="summary-note">La ganancia refleja los costos registrados.<br>Recuerda incluir empaques y mano de obra.</p></aside></div>`;
}

function render() {
  const isCalc = location.hash === '#costos';
  $('#breadcrumb').textContent = isCalc ? 'Calculadora de costos' : location.hash.startsWith('#pedido/') ? 'Detalle del pedido' : 'Pedidos';
  document.querySelectorAll('[data-nav]').forEach(el => {
    const active = el.dataset.nav === (isCalc ? 'costos' : 'pedidos');
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#nav-count').textContent = String(orders.length);
  if (isCalc) renderCalculator();
  else if (location.hash.startsWith('#pedido/')) {
    const order = selectedOrder();
    if (order) renderDetail(order);
    else main.innerHTML = `${heading('Pedido no encontrado', 'MI TALLER', 'Puede haberse eliminado o estar en otro dispositivo.')}<a href="#pedidos" class="button primary">Volver a pedidos</a>`;
  } else renderOrders();
}

function openModal(title, content) {
  modalSnapshot = snapshot;
  $('#modal-content').innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar ventana">${icon('close')}</button></div><div class="modal-body">${content}</div>`;
  if (!modal.open) modal.showModal();
}
function closeModal() { modal.close(); orderFormContext = null; importedOrders = null; }
function orderForm(existing = null, estimate = null) {
  orderFormContext = { existing, estimate };
  const order = existing || { client: '', description: '', quantity: estimate?.quantity || 1, totalPrice: estimate?.revenue || 0, status: 'cotizando', dueDate: '', notes: '' };
  openModal(existing ? 'Editar pedido' : 'Una nueva creación', `<p class="modal-lead">${estimate ? 'Ya llevamos los ingredientes y sus costos. Solo faltan los detalles de tu cliente.' : 'Empieza por los detalles. Puedes añadir los costos de fabricación después.'}</p>
    <form id="order-form"><div class="form-grid">
      <label class="field full"><span>Nombre del cliente *</span><input name="client" value="${escapeHTML(order.client)}" maxlength="100" autocomplete="name" placeholder="¿Para quién vas a crear?" required></label>
      <label class="field full"><span>Descripción del pedido</span><input name="description" value="${escapeHTML(order.description)}" maxlength="200" placeholder="Ej. Velas de lavanda para un cumpleaños"></label>
      <label class="field"><span>Cantidad de velas *</span><input name="quantity" type="text" inputmode="numeric" value="${order.quantity}" maxlength="6" required></label>
      <label class="field"><span>Venta total del pedido (COP)</span><input name="totalPrice" type="text" inputmode="decimal" value="${rawMoney(order.totalPrice)}" maxlength="20" required><small>Sin puntos de miles. No es el precio por vela.</small></label>
      <label class="field"><span>Estado</span><select name="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${order.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="field"><span>Fecha de entrega</span><input name="dueDate" type="date" value="${escapeHTML(order.dueDate)}"></label>
      <label class="field full"><span>Notas</span><textarea name="notes" maxlength="2000" placeholder="Colores, aromas, empaque o algo que quieras recordar…">${escapeHTML(order.notes)}</textarea></label>
    </div>${estimate || existing?.costs.length ? '<p class="field-note">Si cambias la cantidad, revisa los costos y la venta total: conservaremos los valores que ya registraste.</p>' : ''}<p id="order-error" class="inline-message form-error" role="alert"></p><div class="modal-footer"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary">${existing ? 'Guardar cambios' : 'Crear pedido'}</button></div></form>`);
}

function confirmation(title, copy, action, button = 'Confirmar', danger = false) {
  openModal(title, `<p class="confirm-copy">${copy}</p><p class="inline-message form-error" id="confirm-error" role="alert"></p><div class="modal-footer"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button ${danger ? 'danger' : 'primary'}" data-action="${action}">${button}</button></div>`);
}

function backupModal() {
  openModal('Tu taller, bien guardado', `<p class="modal-lead">Los pedidos viven en este dispositivo. No necesitas una cuenta y no se envían a un servidor. El respaldo te permite moverlos a otro teléfono.</p>
    <div class="backup-option"><h3>Guarda una copia de tus pedidos</h3><p>Descarga un archivo y guárdalo en Archivos o en tu Drive. Incluye clientes, costos y notas.</p><button class="button secondary" data-action="export" ${locked ? 'disabled' : ''}>${icon('download')}Exportar respaldo · ${orders.length} pedidos</button>${locked ? `<button class="button secondary" data-action="export-raw">${icon('download')}Descargar datos originales</button>` : ''}</div>
    <div class="backup-option"><h3>Restaurar un respaldo</h3><p>Elige un archivo de Velitas. Podrás revisar cuántos pedidos contiene antes de reemplazar los actuales.</p><label class="field"><span>Archivo de respaldo (.json)</span><input class="file-input" id="backup-file" type="file" accept=".json,application/json"></label><p id="backup-error" class="inline-message form-error" role="alert"></p></div>
    <div class="backup-option"><h3>Instala Velitas en tu iPhone</h3><ol class="install-steps"><li>Abre este enlace en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong> y <strong>Agregar a pantalla de inicio</strong>.</li><li>Abre Velitas desde su icono y crea allí tus pedidos.</li></ol><p id="offline-status">${offlineMessage()}</p>${deferredInstall ? '<button class="button secondary" data-action="install">Instalar en este dispositivo</button>' : ''}</div>
    <p class="backup-warning">Haz una copia antes de cambiar de teléfono, borrar los datos del navegador o cambiar de dirección web. Safari y el icono instalado pueden tener almacenamiento separado. No hay sincronización automática.</p><p class="summary-note">Velitas 1.0.0 · Valores en pesos colombianos (COP)</p>`);
}
function offlineMessage() { return navigator.serviceWorker?.controller ? 'Disponible sin conexión en este dispositivo.' : 'La descarga para uso sin conexión se completa al cargar la app. Si es la primera visita, vuelve a abrirla con internet.'; }
function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function today() { return new Date().toLocaleDateString('en-CA'); }

document.addEventListener('click', async event => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault(); main.focus(); main.scrollIntoView(); return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  try {
    const order = selectedOrder();
    switch (action) {
      case 'new-order': orderForm(); break;
      case 'close-modal': closeModal(); break;
      case 'filter': filter = target.dataset.filter; updateOrderList(); break;
      case 'clear-search': search = ''; filter = 'todos'; renderOrders(); $('#order-search').focus(); break;
      case 'reset-calc': calcDraft = initialDraft(); renderCalculator(); break;
      case 'estimate-order': orderForm(null, currentEstimate()); break;
      case 'edit-order': if (order) orderForm(order); break;
      case 'status':
        if (order && order.status !== target.dataset.status) {
          persist(orders.map(item => item.id === order.id ? { ...item, status: target.dataset.status } : item));
          render(); toast(`Pedido en estado «${STATUS_LABELS[target.dataset.status]}».`);
        }
        break;
      case 'remove-cost': {
        const cost = order?.costs.find(item => item.id === target.dataset.cost);
        if (cost) { modal.dataset.costId = cost.id; confirmation('Eliminar costo', `¿Eliminar <strong>${escapeHTML(cost.label)}</strong> por ${money(cost.amount)}? La ganancia se actualizará.`, 'confirm-remove-cost', 'Eliminar costo', true); }
        break;
      }
      case 'confirm-remove-cost':
        if (order) { persist(orders.map(item => item.id === order.id ? { ...item, costs: item.costs.filter(cost => cost.id !== modal.dataset.costId) } : item)); closeModal(); render(); toast('Costo eliminado.'); }
        break;
      case 'edit-cost': {
        const cost = order?.costs.find(item => item.id === target.dataset.cost);
        if (cost) {
          modal.dataset.costId = cost.id;
          openModal('Editar costo', `<form id="edit-cost-form"><div class="form-grid"><label class="field full"><span>Concepto</span><input name="label" value="${escapeHTML(cost.label)}" maxlength="100" required></label><label class="field full"><span>Valor total (COP)</span><input name="amount" inputmode="decimal" value="${rawMoney(cost.amount)}" maxlength="20" required><small>Sin puntos de miles. Puedes usar coma decimal.</small></label></div><p class="inline-message form-error" id="edit-cost-error" role="alert"></p><div class="modal-footer"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary">Guardar costo</button></div></form>`);
        }
        break;
      }
      case 'delete-order':
        if (order) { modal.dataset.orderId = order.id; confirmation('Eliminar pedido', `Se eliminará el pedido de <strong>${escapeHTML(order.client)}</strong> y sus costos. Esta acción no se puede deshacer.`, 'confirm-delete', 'Eliminar pedido', true); }
        break;
      case 'confirm-delete':
        persist(orders.filter(item => item.id !== modal.dataset.orderId)); closeModal(); location.hash = '#pedidos'; render(); toast('Pedido eliminado.'); break;
      case 'backup': backupModal(); break;
      case 'export': download(exportBackup(orders), `velitas-respaldo-${today()}.json`); toast('Respaldo preparado. Guárdalo en Archivos.'); break;
      case 'export-raw': {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) throw new Error('No hay datos originales disponibles para descargar.');
        download(raw, `velitas-datos-originales-${today()}.json`); break;
      }
      case 'confirm-import':
        if (importedOrders) { persist(importedOrders, true); closeModal(); location.hash = '#pedidos'; render(); toast('Respaldo restaurado.'); }
        break;
      case 'install':
        if (deferredInstall) { await deferredInstall.prompt(); deferredInstall = null; }
        break;
    }
  } catch (error) {
    const errorElement = modal.open ? $('#confirm-error') : null;
    if (errorElement) errorElement.textContent = `No se guardó el cambio. ${error.message}`;
    else toast(`No se guardó el cambio. ${error.message}`, true);
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'order-search') { search = event.target.value; updateOrderList(); }
  if (event.target.closest('#calc-form')) { calcDraft = Object.fromEntries(new FormData($('#calc-form'))); updateEstimate(); }
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (!['order-form', 'add-cost-form', 'edit-cost-form', 'calc-form'].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'calc-form') return;
    if (form.id === 'order-form') {
      const { existing, estimate } = orderFormContext;
      const order = validateOrder({ id: existing?.id || crypto.randomUUID(), client: data.client,
        description: data.description, quantity: parseNumber(data.quantity, 'Cantidad', { integer: true, positive: true }),
        status: data.status, totalPrice: moneyToCents(data.totalPrice, 'Venta total'), costs: existing?.costs || estimate?.costs.map(cost => ({ ...cost, id: crypto.randomUUID() })) || [],
        createdAt: existing?.createdAt || new Date().toISOString(), dueDate: data.dueDate, notes: data.notes });
      persist(existing ? orders.map(item => item.id === order.id ? order : item) : [...orders, order]);
      closeModal(); location.hash = `#pedido/${encodeURIComponent(order.id)}`; render(); toast(existing ? 'Pedido actualizado.' : 'Tu nuevo pedido está listo.');
    } else {
      const order = selectedOrder();
      if (!order) throw new Error('No encontramos el pedido.');
      const amount = moneyToCents(data.amount, 'Costo');
      if (!data.label.trim()) throw new Error('Escribe el nombre del costo.');
      const costs = form.id === 'add-cost-form' ? [...order.costs, { id: crypto.randomUUID(), label: data.label.trim(), amount }]
        : order.costs.map(cost => cost.id === modal.dataset.costId ? { ...cost, label: data.label.trim(), amount } : cost);
      persist(orders.map(item => item.id === order.id ? { ...item, costs } : item));
      if (form.id === 'edit-cost-form') closeModal();
      render(); toast('Costo guardado. Ganancia actualizada.');
      if (form.id === 'add-cost-form') $('#add-cost-form [name="label"]')?.focus();
    }
  } catch (error) {
    const selector = form.id === 'order-form' ? '#order-error' : form.id === 'edit-cost-form' ? '#edit-cost-error' : '#cost-error';
    const el = $(selector);
    if (el) el.textContent = `No se guardó el cambio. ${error.message}`; else toast(error.message, true);
  }
});

document.addEventListener('change', async event => {
  if (event.target.id !== 'backup-file') return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera el máximo de 5 MB.');
    const next = importBackup(await file.text());
    importedOrders = next;
    confirmation('Restaurar tus pedidos', `El respaldo contiene <strong>${next.length} pedido${next.length === 1 ? '' : 's'}</strong>. Reemplazará los <strong>${orders.length} pedidos actuales</strong> de este dispositivo. Exporta antes una copia si quieres conservarlos.`, 'confirm-import', 'Reemplazar y restaurar', true);
  } catch (error) { if ($('#backup-error')) $('#backup-error').textContent = error.message; }
});

window.addEventListener('hashchange', () => { if (modal.open) closeModal(); render(); window.scrollTo(0, 0); main.focus({ preventScroll: true }); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try { orders = loadOrders(); snapshot = localStorage.getItem(STORAGE_KEY); render(); toast('Pedidos actualizados desde otra pestaña.'); }
  catch { toast('Los datos cambiaron en otra pestaña y no se pudieron leer. Recarga para protegerlos.', true); locked = true; }
});
function updateConnection() {
  $('#connection').classList.toggle('offline', !navigator.onLine);
  $('#connection').innerHTML = `<i></i>${navigator.onLine ? 'Solo en este dispositivo' : 'Trabajando sin conexión'}`;
}
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
updateConnection();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    if ($('#offline-status')) $('#offline-status').textContent = offlineMessage();
  }).catch(() => toast('La app funciona, pero no se pudo activar el modo sin conexión. Vuelve a abrirla con internet.', true));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if ($('#offline-status')) $('#offline-status').textContent = offlineMessage(); });
}
