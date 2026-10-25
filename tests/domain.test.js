import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimate, costForQuantity, moneyToCents, orderTotals, parseNumber, validateOrder } from '../dist/domain.js';
import { exportBackup, importBackup, loadOrders, saveOrders, STORAGE_KEY } from '../dist/storage.js';

const estimate = (overrides = {}) => calculateEstimate({ quantity: '10', gramsPerUnit: '125',
  waxPricePerKg: '20000', transport: '5000', dye: '1000', fragrance: '3000', wick: '2000',
  molds: '4000', salePerUnit: '10000', ...overrides });
const order = (overrides = {}) => ({ id: 'order-1', client: 'María', description: 'Velas de lavanda',
  quantity: 10, status: 'cotizando', totalPrice: 10_000_000, costs: estimate().costs,
  createdAt: '2026-10-25T12:00:00.000Z', dueDate: '2026-11-01', notes: '', ...overrides });
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('COP decimal comma is exact; grouped, negative and malformed inputs are rejected', () => {
  assert.equal(moneyToCents('1234,56'), 123456);
  assert.equal(moneyToCents('0.29'), 29);
  assert.equal(moneyToCents(''), 0);
  assert.equal(parseNumber('12,5'), 12.5);
  for (const input of ['1.000,00', '-1', '1e3', 'Infinity', 'NaN', '1 000', '1,2,3', null, true, 1e20]) {
    assert.throws(() => moneyToCents(input));
  }
  assert.throws(() => moneyToCents('1.005'));
  assert.throws(() => parseNumber('0', 'Cantidad', { positive: true }));
  assert.throws(() => parseNumber('1,5', 'Cantidad', { integer: true }));
});

test('a 10-candle lot uses 1.25 kg of wax and adds all extras once per lot', () => {
  const result = estimate();
  assert.equal(result.costs[0].amount, 2_500_000);
  assert.deepEqual(result.costs.map(cost => cost.label), ['Cera', 'Transportes', 'Colorante', 'Aromatizante', 'Pabilo', 'Moldes']);
  assert.equal(result.totalCost, 4_000_000);
  assert.equal(result.unitCost, 400_000);
  assert.equal(result.revenue, 10_000_000);
  assert.equal(result.profit, 6_000_000);
  assert.equal(result.margin, 60);
});

test('100 COP per candle becomes 1000 COP for ten; batch and default stay at 100 COP', () => {
  assert.equal(costForQuantity('100', 'unit', '10'), 100_000);
  assert.equal(costForQuantity('100', 'batch', 10), 10_000);
  assert.equal(costForQuantity('100', undefined, 10), 10_000);
  assert.equal(costForQuantity('0,29', 'unit', 10), 290);
  assert.equal(costForQuantity('', 'unit', 10), 0);
});

test('material modes are independent and changing quantity scales only unit costs and wax', () => {
  const input = { dye: '100', dyeMode: 'unit', fragrance: '0,29', fragranceMode: 'unit',
    molds: '400', moldsMode: 'unit' };
  const ten = estimate(input);
  const twenty = estimate({ ...input, quantity: '20' });
  assert.deepEqual(ten.costs.map(cost => cost.amount), [2_500_000, 500_000, 100_000, 290, 200_000, 400_000]);
  assert.equal(ten.totalCost, 3_700_290);
  assert.equal(ten.profit, 6_299_710);
  assert.deepEqual(twenty.costs.map(cost => cost.amount), [5_000_000, 500_000, 200_000, 580, 200_000, 800_000]);
  for (const key of ['transport', 'dye', 'fragrance', 'wick', 'molds']) {
    const result = estimate({ [key]: '100', [`${key}Mode`]: 'unit' });
    assert.equal(result.costs.find(cost => cost.id === key).amount, 100_000);
  }
  const transferred = validateOrder(order({ costs: ten.costs }));
  const restored = importBackup(exportBackup([transferred]))[0];
  assert.equal(orderTotals(restored).cost, ten.totalCost);
  assert.deepEqual(restored.costs, ten.costs);
});

test('material cost modes reject invalid quantities, modes and multiplied amounts beyond the limit', () => {
  for (const mode of [null, '', 'individual', true, 1, {}, []]) {
    assert.throws(() => costForQuantity('100', mode, 10));
    assert.throws(() => estimate({ dyeMode: mode }));
  }
  for (const quantity of [0, -1, '1.5', '1.000000000000000001', 100001, undefined]) {
    assert.throws(() => costForQuantity('100', 'unit', quantity));
    assert.throws(() => costForQuantity('100', 'batch', quantity));
  }
  assert.equal(costForQuantity('100000000000', 'unit', 10), 100_000_000_000_000);
  assert.throws(() => costForQuantity('100000000000.01', 'unit', 10));
  assert.throws(() => estimate({ transport: '1000000000000', transportMode: 'unit' }));
});

test('decimal limits and integer quantities are checked before floating-point rounding', () => {
  assert.equal(Number('1.000000000000000001'), 1);
  assert.throws(() => parseNumber('1.000000000000000001', 'Cantidad', { integer: true }));
  assert.throws(() => estimate({ quantity: '100000,0000000000001' }));
  assert.throws(() => parseNumber('1000000000.000000000000001'));
  assert.throws(() => parseNumber('9007199254740993', 'Cantidad', { integer: true }));
  assert.throws(() => estimate({ gramsPerUnit: '1000000.000000000000001' }));
  assert.equal(parseNumber('1.000000000000000000', 'Cantidad', { integer: true }), 1);
  assert.equal(estimate({ gramsPerUnit: '1000000.000000000000000', quantity: 1 }).quantity, 1);
});

test('accepted quote and imported amounts can roundtrip through order and cost editing', () => {
  const quote = estimate({ quantity: '100000', salePerUnit: '20000' });
  assert.equal(quote.revenue, 200_000_000_000);
  const transferred = validateOrder(order({ quantity: quote.quantity, costs: quote.costs,
    totalPrice: moneyToCents(String(quote.revenue / 100)) }));
  assert.equal(transferred.totalPrice, quote.revenue);
  const imported = importBackup(exportBackup([order({ totalPrice: 100_000_000_000_000,
    costs: [{ id: 'maximum', label: 'Costo importado', amount: 100_000_000_000_000 }] })]))[0];
  assert.equal(moneyToCents(String(imported.totalPrice / 100)), imported.totalPrice);
  assert.equal(moneyToCents(String(imported.costs[0].amount / 100)), imported.costs[0].amount);
  assert.equal(moneyToCents('999999999999,99'), 99_999_999_999_999);
  assert.throws(() => moneyToCents('1000000000000.01'));
  assert.throws(() => moneyToCents('9007199254740993'));
});

test('wax rounds the whole lot once and preserves fractional gram precision', () => {
  const result = estimate({ quantity: '3', gramsPerUnit: '0,5', waxPricePerKg: '10',
    transport: '', dye: '', fragrance: '', wick: '', molds: '', salePerUnit: '' });
  assert.equal(result.totalCost, 2);
  assert.equal(result.revenue, 0);
  assert.equal(result.profit, -2);
  assert.equal(result.margin, null);
});

test('losses remain visible and zero sales has no percentage margin', () => {
  assert.equal(estimate({ salePerUnit: '1000' }).profit, -3_000_000);
  assert.equal(estimate({ salePerUnit: '0' }).margin, null);
  assert.deepEqual(orderTotals({ totalPrice: 100, costs: [{ amount: 150 }] }), { cost: 150, profit: -50, margin: -50 });
});

test('estimates reject impossible quantity, grams, and unsafe money totals', () => {
  for (const overrides of [{ quantity: 0 }, { quantity: '1.5' }, { quantity: 100001 },
    { gramsPerUnit: 0 }, { gramsPerUnit: 1000001 }, { quantity: 100000, gramsPerUnit: 1000000, waxPricePerKg: 1000000000 }]) {
    assert.throws(() => estimate(overrides));
  }
  assert.throws(() => orderTotals({ totalPrice: Number.MAX_SAFE_INTEGER + 1, costs: [] }));
  assert.throws(() => orderTotals({ totalPrice: 0, costs: [{ amount: 100_000_000_000_000 }, { amount: 1 }] }));
});

test('order validation normalizes text and rejects invalid dates, statuses, IDs and amounts', () => {
  const validated = validateOrder(order({ client: ' María ' }));
  assert.equal(validated.client, 'María');
  assert.equal(validateOrder(order({ dueDate: '2028-02-29' })).dueDate, '2028-02-29');
  for (const overrides of [{ client: ' ' }, { status: 'constructor' }, { status: 'pagado' },
    { totalPrice: -1 }, { totalPrice: 0.5 }, { quantity: 0 }, { dueDate: '2026-02-30' },
    { dueDate: '2026-02-29' }, { dueDate: '2026-13-01' },
    { createdAt: '2026-02-30T12:00:00.000Z' }, { createdAt: '2026-10-25T24:00:00.000Z' },
    { costs: [{ id: 'one', label: 'Cera', amount: 0 }, { id: 'one', label: 'Pabilo', amount: 1 }] }]) {
    assert.throws(() => validateOrder(order(overrides)));
  }
});

test('persistence and backups roundtrip without losing cents or customer data', () => {
  const storage = memory();
  assert.deepEqual(loadOrders(storage), []);
  const orders = [order({ costs: [{ id: 'one', label: 'Cera', amount: 29 }] })];
  saveOrders(orders, storage);
  assert.deepEqual(loadOrders(storage), orders);
  assert.deepEqual(importBackup(exportBackup(orders)), orders);
});

test('corrupt data and storage failures stay visible and are never silently replaced', () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, '{bad json');
  assert.throws(() => loadOrders(storage), /No se pudieron leer/);
  assert.equal(storage.getItem(STORAGE_KEY), '{bad json');
  assert.throws(() => saveOrders([order()], { setItem() { throw new Error('QuotaExceededError'); } }), /QuotaExceededError/);
  assert.throws(() => saveOrders([order(), order()], storage), /repetidos/);
  assert.equal(storage.getItem(STORAGE_KEY), '{bad json');
});

test('backup import rejects wrong versions, broken orders, duplicates and oversized files', () => {
  for (const input of ['oops', 'null', JSON.stringify({ app: 'other', version: 1, orders: [] }),
    JSON.stringify({ app: 'velitas', version: 2, orders: [] }),
    JSON.stringify({ app: 'velitas', version: 1, orders: [order({ totalPrice: -1 })] }),
    JSON.stringify({ app: 'velitas', version: 1, orders: [order(), order()] }),
    ' '.repeat(5 * 1024 * 1024 + 1)]) {
    assert.throws(() => importBackup(input));
  }
});
