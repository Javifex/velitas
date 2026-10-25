import { orderTotals, validateOrder } from './domain.js';

export const STORAGE_KEY = 'velitas.orders.v1';

function validateOrders(value) {
  if (!Array.isArray(value) || value.length > 10_000) throw new Error('La lista de pedidos no es válida.');
  const ids = new Set();
  let revenue = 0;
  let costs = 0;
  return value.map(item => {
    const order = validateOrder(item);
    if (ids.has(order.id)) throw new Error('Hay pedidos con identificadores repetidos.');
    ids.add(order.id);
    revenue += order.totalPrice;
    costs += orderTotals(order).cost;
    if (!Number.isSafeInteger(revenue) || !Number.isSafeInteger(costs)) {
      throw new Error('Los totales de los pedidos exceden el límite permitido.');
    }
    return order;
  });
}

export function loadOrders(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  try {
    return validateOrders(JSON.parse(raw));
  } catch (error) {
    throw new Error(`No se pudieron leer los pedidos guardados. ${error.message}`);
  }
}

export function saveOrders(orders, storage = localStorage) {
  const validated = validateOrders(orders);
  storage.setItem(STORAGE_KEY, JSON.stringify(validated));
}

export function exportBackup(orders) {
  return JSON.stringify({ app: 'velitas', version: 1, exportedAt: new Date().toISOString(),
    orders: validateOrders(orders) }, null, 2);
}

export function importBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024) {
    throw new Error('El respaldo debe ser un archivo de texto de máximo 5 MB.');
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('El archivo no contiene un respaldo JSON válido.'); }
  if (!data || data.app !== 'velitas' || data.version !== 1) throw new Error('Este respaldo no corresponde a Velitas versión 1.');
  return validateOrders(data.orders);
}
