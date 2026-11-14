// Reference arithmetic for the GramGuard spec worked examples.
// Weights: integer milligrams (BigInt). Percent: integer hundredths of a percent (8% = 800).
const mg = (g) => BigInt(Math.round(g * 1000));
const g = (m, unit) => {
  const dp = unit === 1000n ? 0 : unit === 100n ? 1 : 2;
  return (Number(m) / 1000).toFixed(dp);
};
const roundHalfUp = (n, d) => (2n * n + d) / (2n * d); // positive rationals n/d -> nearest integer, half up
const roundToUnit = (n, d, unit) => roundHalfUp(n, d * unit) * unit;

function split({ mode, amount, pct, basis, unit }) {
  // mode: 'total' (amount = total mixture) | 'wax' (amount = wax weight)
  let fo, wax, total, exactFoN, exactFoD;
  if (mode === 'total') {
    [exactFoN, exactFoD] = basis === 'wax' ? [amount * pct, 10000n + pct] : [amount * pct, 10000n];
    fo = roundToUnit(exactFoN, exactFoD, unit);
    total = amount; wax = total - fo;
  } else {
    [exactFoN, exactFoD] = basis === 'wax' ? [amount * pct, 10000n] : [amount * pct, 10000n - pct];
    fo = roundToUnit(exactFoN, exactFoD, unit);
    wax = amount; total = wax + fo;
  }
  return { fo, wax, total, exactFo: Number(exactFoN) / Number(exactFoD) / 1000 };
}

function apportion(total, parts, unit) {
  const sum = parts.reduce((a, b) => a + b, 0n);
  const rows = parts.map((p, i) => {
    const n = total * p; const d = sum * unit;
    return { i, floor: (n / d) * unit, rem: n % d, exact: Number(n) / Number(sum) / 1000 };
  });
  let left = (total - rows.reduce((a, r) => a + r.floor, 0n)) / unit;
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const r of order) { if (left <= 0n) break; r.floor += unit; left--; }
  return rows.map((r) => ({ grams: r.floor, exact: r.exact }));
}

const pctStr = (x) => (Math.round(x * 100 + 1e-9) / 100).toFixed(2);

function show(label, s, unit, oils, waxes) {
  console.log(`\n${label}`);
  console.log(`  exact FO=${s.exactFo.toFixed(5)}  FO=${g(s.fo, unit)}  wax=${g(s.wax, unit)}  total=${g(s.total, unit)}`);
  const effWax = (Number(s.fo) / Number(s.wax)) * 100, effTot = (Number(s.fo) / Number(s.total)) * 100;
  console.log(`  effective: ${pctStr(effWax)}% of wax, ${pctStr(effTot)}% of total`);
  if (oils) console.log('  oils :', apportion(s.fo, oils, unit).map((r) => g(r.grams, unit)).join(' | '));
  if (waxes) console.log('  waxes:', apportion(s.wax, waxes, unit).map((r) => g(r.grams, unit)).join(' | '));
}

const U1 = 1000n, U01 = 100n, U001 = 10n;
show('WE-1', split({ mode: 'total', amount: mg(500), pct: 800n, basis: 'wax', unit: U01 }), U01);
show('WE-2', split({ mode: 'total', amount: mg(500), pct: 800n, basis: 'total', unit: U01 }), U01);
show('WE-3', split({ mode: 'wax', amount: mg(1000), pct: 1000n, basis: 'wax', unit: U01 }), U01);
show('WE-4', split({ mode: 'wax', amount: mg(450), pct: 1000n, basis: 'total', unit: U01 }), U01);
show('WE-5', split({ mode: 'total', amount: mg(1080), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-6 at 0.1', split({ mode: 'total', amount: mg(250), pct: 900n, basis: 'total', unit: U01 }), U01, [50n, 30n, 20n]);
show('WE-6 at 0.01', split({ mode: 'total', amount: mg(250), pct: 900n, basis: 'total', unit: U001 }), U001, [50n, 30n, 20n]);
show('WE-7 at 1', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U1 }), U1, [2n, 1n]);
show('WE-7 at 0.1', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U01 }), U01, [2n, 1n]);
show('WE-7 at 0.01', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U001 }), U001, [2n, 1n]);
show('WE-9a', split({ mode: 'total', amount: mg(1800), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-9b', split({ mode: 'total', amount: mg(540), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-9c', split({ mode: 'total', amount: mg(625), pct: 800n, basis: 'wax', unit: U01 }), U01);
show('WE-10', split({ mode: 'total', amount: mg(800), pct: 1000n, basis: 'wax', unit: U01 }), U01, [1n], [70n, 30n]);
show('WE-11', split({ mode: 'total', amount: mg(300), pct: 0n, basis: 'wax', unit: U01 }), U01);
show('WE-12', split({ mode: 'total', amount: mg(100), pct: 825n, basis: 'wax', unit: U001 }), U001, [60n, 40n]);
