export function manualUsageDelta(value, recordedUsed = 0) {
  if (value === '' || value == null) return null;
  const total = Number(value), used = Number(recordedUsed || 0);
  if (!Number.isFinite(total) || total < 0 || Math.abs(total * 100 - Math.round(total * 100)) > 0.000001) throw new Error('Enter a non-negative total with at most two decimal places.');
  if (total < used) throw new Error(`Total days taken cannot be lower than the ${used} days already recorded. Use an authorized balance correction for a reduction.`);
  return { total, additional: Math.round((total - used) * 100) / 100 };
}
export function previewManualUsage(balance, policy, value) {
  if (!balance?.hasEntitlement || value === '' || value == null) return balance;
  const usage = manualUsageDelta(value, balance.used);
  const available = Math.round((Number(balance.available) - usage.additional) * 100) / 100;
  const rules = policy?.requestRules || {}, negative = policy?.balanceRules || {};
  const extra = policy?.allowNegativeBalance === true || negative.negativeBalanceAllowed === true ? Number(policy?.maxNegativeDays ?? negative.maximumNegativeBalance ?? 0) : 0;
  const cap = Number(rules.maximumDuration ?? rules.maximumDaysPerRequest ?? Infinity);
  return { ...balance, used: usage.total, available, maximumRequestable: Math.max(0, Math.min(available + extra, cap)) };
}
