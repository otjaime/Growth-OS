export interface FeeCalculation {
  clientId: string;
  period: string;
  baseRetainer: number;
  benchmarkROAS: number;
  actualROAS: number;
  incrementalROAS: number;
  revenueBase: number;
  incrementalRevenue: number;
  perfFeePercent: number;
  perfFeeAmount: number;
  totalFee: number;
}

export function calculateMonthlyFee(params: {
  client: {
    id: string;
    feeStructure: {
      baseRetainer: number;
      perfFeePercent: number;
      benchmarkROAS: number;
    };
  };
  monthlyRevenue: number;
  monthlyROAS: number;
  period: string;
}): FeeCalculation {
  const { client, monthlyRevenue, monthlyROAS, period } = params;
  const { baseRetainer, perfFeePercent, benchmarkROAS } = client.feeStructure;

  const incrementalROAS = Math.max(0, monthlyROAS - benchmarkROAS);

  // Revenue at benchmark vs actual — the incremental revenue is the difference
  // If ROAS <= benchmark, no incremental revenue
  let incrementalRevenue = 0;
  if (monthlyROAS > benchmarkROAS && monthlyROAS > 0) {
    // revenueBase = what revenue would have been at benchmark ROAS
    // incrementalRevenue = actual revenue - benchmark revenue
    const spend = monthlyROAS === 0 ? 0 : monthlyRevenue / monthlyROAS;
    const benchmarkRevenue = spend * benchmarkROAS;
    incrementalRevenue = monthlyRevenue - benchmarkRevenue;
  }

  const perfFeeAmount = incrementalRevenue > 0
    ? incrementalRevenue * perfFeePercent / 100
    : 0;

  // Revenue base is what would have been earned at benchmark
  const spend = monthlyROAS === 0 ? 0 : monthlyRevenue / monthlyROAS;
  const revenueBase = spend * benchmarkROAS;

  return {
    clientId: client.id,
    period,
    baseRetainer,
    benchmarkROAS,
    actualROAS: monthlyROAS,
    incrementalROAS,
    revenueBase,
    incrementalRevenue,
    perfFeePercent,
    perfFeeAmount,
    totalFee: baseRetainer + perfFeeAmount,
  };
}
