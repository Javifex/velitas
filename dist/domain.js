export const STATUS_LABELS = Object.freeze({
  cotizando: 'Cotizando',
  ejecutando: 'Ejecutando',
  completado: 'Completado',
});

const MAX_MONEY = 100_000_000_000_000;

function decimalText(value, label) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label}: escribe un número válido.`);
  }
  const text = String(value).trim();
  if (!text) return '0';
  if (text.length > 64 || !/^\d+(?:[.,]\d+)?$/.test(text)) {
    throw new Error(`${label}: usa números sin separadores de miles.`);
  }
  return text.replace(',', '.');
}

export function parseNumber(value, label = 'Valor', options = {}) {
  const text = decimalText(value, label);
  const [whole, fraction = ''] = text.split('.');
  const hasFraction = /[1-9]/.test(fraction);
  const wholeInteger = BigInt(whole);
  if (wholeInteger > 1_000_000_000n || (wholeInteger === 1_000_000_000n && hasFraction)) {
    throw new Error(`${label}: el valor debe estar entre 0 y 1.000.000.000.`);
  }
  if (options.integer && hasFraction) {
    throw new Error(`${label}: escribe un número entero.`);
  }
  const number = Number(text);
  if (options.positive && number <= 0) {
    throw new Error(`${label}: el valor debe ser mayor que cero.`);
  }
  return number;
}

export function moneyToCents(value, label = 'Valor') {
  const text = decimalText(value, label);
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > 2) throw new Error(`${label}: usa máximo dos decimales.`);
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(MAX_MONEY)) throw new Error(`${label}: el monto excede el límite permitido.`);
  return Number(cents);
}

function checkedMoney(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) {
    throw new Error(`${label}: el monto excede el límite permitido.`);
  }
  return value;
}

export function costForQuantity(value, mode = 'batch', quantity, label = 'Costo') {
  if (mode !== 'batch' && mode !== 'unit') throw new Error(`${label}: elige un costo por vela o por lote.`);
  const count = parseNumber(quantity, 'Cantidad', { integer: true, positive: true });
  if (count > 100_000) throw new Error('Cantidad: el máximo es 100.000 velas.');
  const amount = moneyToCents(value, label);
  return checkedMoney(amount * (mode === 'unit' ? count : 1), label);
}

export function orderTotals(order) {
  const revenue = checkedMoney(order.totalPrice, 'Precio de venta');
  const cost = order.costs.reduce((sum, item) =>
    checkedMoney(sum + checkedMoney(item.amount, 'Costo'), 'Costo total'), 0);
  return { cost, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue * 100 : null };
}

export function calculateEstimate(input) {
  const quantity = parseNumber(input.quantity, 'Cantidad', { integer: true, positive: true });
  parseNumber(input.gramsPerUnit, 'Gramaje', { positive: true });
  if (quantity > 100_000) throw new Error('Cantidad: el máximo es 100.000 velas.');
  const waxPrice = moneyToCents(input.waxPricePerKg, 'Kilo de cera');
  const gramsText = decimalText(input.gramsPerUnit, 'Gramaje');
  const [whole, fraction = ''] = gramsText.split('.');
  const gramsScale = 10n ** BigInt(fraction.length);
  const gramsInteger = BigInt(whole) * gramsScale + BigInt(fraction || '0');
  if (gramsInteger > 1_000_000n * gramsScale) throw new Error('Gramaje: el máximo es 1.000.000 de gramos por vela.');
  const denominator = gramsScale * 1000n;
  // Se redondea la cera del lote una sola vez para no acumular centavos por vela.
  const wax = Number((gramsInteger * BigInt(quantity) * BigInt(waxPrice) + denominator / 2n) / denominator);
  const costs = [{ id: 'cera', label: 'Cera', amount: checkedMoney(wax, 'Cera') }];
  for (const [key, label] of [
    ['transport', 'Transportes'], ['dye', 'Colorante'], ['fragrance', 'Aromatizante'],
    ['wick', 'Pabilo'], ['molds', 'Moldes'],
  ]) {
    costs.push({ id: key, label, amount: costForQuantity(input[key], input[`${key}Mode`], quantity, label) });
  }
  const revenue = checkedMoney(moneyToCents(input.salePerUnit, 'Precio por vela') * quantity, 'Venta total');
  const totals = orderTotals({ totalPrice: revenue, costs });
  return {
    quantity, costs, totalCost: totals.cost, unitCost: Math.round(totals.cost / quantity),
    revenue, profit: totals.profit, margin: totals.margin,
  };
}

function textField(value, label, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new Error(`${label}: el texto no es válido.`);
  const text = value.trim();
  if (text.length > max || (required && !text)) throw new Error(`${label}: revisa el texto ingresado.`);
  return text;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function validateOrder(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El pedido no es válido.');
  const id = textField(value.id, 'Identificador', 100, true);
  const client = textField(value.client, 'Cliente', 100, true);
  const description = textField(value.description, 'Descripción', 200);
  if (!Number.isSafeInteger(value.quantity) || value.quantity < 1 || value.quantity > 100_000) {
    throw new Error('Cantidad: escribe un entero entre 1 y 100.000.');
  }
  if (!Object.hasOwn(STATUS_LABELS, value.status)) throw new Error('El estado del pedido no es válido.');
  const totalPrice = checkedMoney(value.totalPrice, 'Precio de venta');
  if (!Array.isArray(value.costs) || value.costs.length > 500) throw new Error('La lista de costos no es válida.');
  const ids = new Set();
  const costs = value.costs.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('El costo no es válido.');
    const costId = textField(item.id, 'Identificador de costo', 100, true);
    if (ids.has(costId)) throw new Error('Hay costos con identificadores repetidos.');
    ids.add(costId);
    return { id: costId, label: textField(item.label, 'Nombre del costo', 100, true), amount: checkedMoney(item.amount, 'Costo') };
  });
  const createdAt = textField(value.createdAt, 'Fecha de creación', 40, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt)
      || Number.isNaN(Date.parse(createdAt))
      || new Date(createdAt).toISOString().slice(0, 19) !== createdAt.slice(0, 19)) {
    throw new Error('La fecha de creación no es válida.');
  }
  const dueDate = textField(value.dueDate, 'Fecha de entrega', 10);
  if (dueDate && !validDate(dueDate)) throw new Error('La fecha de entrega no es válida.');
  const notes = textField(value.notes, 'Notas', 2000);
  const order = { id, client, description, quantity: value.quantity, status: value.status,
    totalPrice, costs, createdAt, dueDate, notes };
  orderTotals(order);
  return order;
}
