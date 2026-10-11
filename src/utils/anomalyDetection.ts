/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DetectedAnomaly, EnergyReading } from '../types/energy.ts';

/**
 * Calculates the statistical median of a sorted array of numbers.
 */
function calculateMedian(sortedArr: number[]): number {
  const n = sortedArr.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sortedArr[mid] : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD) with zero-variance baseline protection.
 */
function calculateMad(values: number[], median: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const rawMad = calculateMedian(deviations);

  // Safety against zero-MAD baseline (e.g. constant standby loads)
  const safeFloor = Math.max(0.05 * Math.abs(median), 0.5);
  return rawMad === 0 ? safeFloor : rawMad;
}

export interface AnomalyEngineOptions {
  robustZThreshold?: number; // Default 3.0 (Modified Z-score)
  minSamplesPerBin?: number; // Minimum historical samples required (default 3)
  tariffUsdPerKwh?: number; // Default $0.14/kWh illustrative tariff
  binningMode?: 'adaptive' | 'day_type' | 'day_of_week'; // Default adaptive
}

/**
 * Detects anomalies using contextual time binning (Adaptive Day-Type or Day-of-Week x Hour-of-Day)
 * and robust Median / Median Absolute Deviation (MAD) statistics.
 */
export function detectEnergyAnomalies(
  readings: EnergyReading[],
  options: AnomalyEngineOptions = {}
): {
  anomalies: DetectedAnomaly[];
  totalEvaluated: number;
  totalFlaggedCount: number;
  totalExcessKwh: number;
  totalPotentialCostExposureUsd: number;
} {
  const thresholdZ = options.robustZThreshold ?? 3.0;
  const minSamples = options.minSamplesPerBin ?? 3;
  const tariffRate = options.tariffUsdPerKwh ?? 0.14;
  const requestedMode = options.binningMode ?? 'adaptive';

  // Group readings by building_id
  const readingsByBuilding = new Map<string, EnergyReading[]>();
  for (const r of readings) {
    if (!readingsByBuilding.has(r.building_id)) {
      readingsByBuilding.set(r.building_id, []);
    }
    readingsByBuilding.get(r.building_id)!.push(r);
  }

  const detectedAnomalies: DetectedAnomaly[] = [];
  let totalExcessKwh = 0;

  for (const [buildingId, buildingReadings] of readingsByBuilding.entries()) {
    // Sort chronologically
    const sorted = [...buildingReadings].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Determine span in days
    const firstTime = new Date(sorted[0].timestamp).getTime();
    const lastTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const spanDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

    // Adaptive mode: If less than 28 days of history, use 'day_type' (weekday/weekend x 24h = 48 bins)
    // to ensure sufficient sample depth (10+ samples per bin). If >= 28 days, use 'day_of_week' (7 x 24h = 168 bins).
    const useDayType =
      requestedMode === 'day_type' || (requestedMode === 'adaptive' && spanDays < 28);

    const getBinKey = (d: Date) => {
      const h = d.getHours();
      if (useDayType) {
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return `${isWeekend ? 'WKD' : 'WKY'}_${h}`;
      } else {
        return `${d.getDay()}_${h}`;
      }
    };

    // Build historical bins
    const bins = new Map<string, number[]>();
    for (const r of sorted) {
      const d = new Date(r.timestamp);
      const binKey = getBinKey(d);
      if (!bins.has(binKey)) {
        bins.set(binKey, []);
      }
      bins.get(binKey)!.push(r.consumption_kwh);
    }

    // Precalculate median and safe MAD for each bin
    const binStats = new Map<
      string,
      { median: number; mad: number; count: number; sortedVals: number[] }
    >();

    for (const [binKey, vals] of bins.entries()) {
      const sortedVals = [...vals].sort((a, b) => a - b);
      const median = calculateMedian(sortedVals);
      const mad = calculateMad(sortedVals, median);
      binStats.set(binKey, { median, mad, count: vals.length, sortedVals });
    }

    // Evaluate each reading against its contextual baseline
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const d = new Date(r.timestamp);
      const dayOfWeek = d.getDay();
      const hourOfDay = d.getHours();
      const binKey = getBinKey(d);
      const stats = binStats.get(binKey);

      if (!stats || stats.count < minSamples) {
        // Safe skip: Insufficient historical baseline data to calculate honest bounds
        continue;
      }

      const { median, mad } = stats;
      // Robust Modified Z-Score: M_i = 0.6745 * (x - median) / MAD
      const robustZ = (0.6745 * (r.consumption_kwh - median)) / mad;

      const upperCutoff = median + (thresholdZ * mad) / 0.6745;
      const lowerCutoff = Math.max(0, median - (thresholdZ * mad) / 0.6745);

      if (robustZ > thresholdZ) {
        const excess = Math.max(0, r.consumption_kwh - upperCutoff);
        const costExposure = excess * tariffRate;
        totalExcessKwh += excess;

        const isNight = hourOfDay < 7 || hourOfDay >= 20;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let anomalyType: DetectedAnomaly['anomaly_type'] = 'HIGH_PEAK';
        let hypothesis = 'Elevated consumption during operational hours. Check simultaneous equipment staging.';
        let severity: DetectedAnomaly['severity'] = 'medium';

        if (isNight || isWeekend) {
          anomalyType = 'OFF_HOURS_SURGE';
          hypothesis =
            'Unexpected high baseload during unoccupied hours. Check HVAC scheduling overrides, stuck dampers, or lighting.';
          severity = robustZ > 6.0 ? 'critical' : 'high';
        } else if (robustZ > 8.0) {
          severity = 'critical';
          hypothesis = 'Severe demand spike. Inspect concurrent large motor inrush or short-cycle equipment behavior.';
        } else if (robustZ > 4.5) {
          severity = 'high';
        }

        detectedAnomalies.push({
          anomaly_id: `ANOM_${buildingId}_${r.reading_id || i}`,
          reading_id: r.reading_id,
          building_id: buildingId,
          timestamp: r.timestamp,
          consumption_kwh: r.consumption_kwh,
          severity,
          anomaly_type: anomalyType,
          status: 'flagged',
          explanation: {
            observed_kwh: r.consumption_kwh,
            baseline_median_kwh: Math.round(median * 100) / 100,
            mad_kwh: Math.round(mad * 100) / 100,
            robust_z_score: Math.round(robustZ * 100) / 100,
            threshold_upper_kwh: Math.round(upperCutoff * 100) / 100,
            threshold_lower_kwh: Math.round(lowerCutoff * 100) / 100,
            bin_sample_count: stats.count,
            hour_of_day: hourOfDay,
            day_of_week: dayOfWeek,
            reason: `Reading (${r.consumption_kwh} kWh) exceeded the contextual median baseline (${median.toFixed(
              1
            )} kWh) by +${robustZ.toFixed(1)} robust MAD deviations (upper threshold: ${upperCutoff.toFixed(1)} kWh).`,
            investigation_hypothesis: hypothesis,
            excess_kwh: Math.round(excess * 100) / 100,
            potential_cost_exposure_usd: Math.round(costExposure * 100) / 100,
          },
        });
      } else if (robustZ < -thresholdZ && median > 10.0) {
        // Unusual drop: e.g. sensor communication failure or unexpected total shutdown
        detectedAnomalies.push({
          anomaly_id: `ANOM_DROP_${buildingId}_${r.reading_id || i}`,
          reading_id: r.reading_id,
          building_id: buildingId,
          timestamp: r.timestamp,
          consumption_kwh: r.consumption_kwh,
          severity: 'low',
          anomaly_type: 'UNUSUAL_DROP',
          status: 'flagged',
          explanation: {
            observed_kwh: r.consumption_kwh,
            baseline_median_kwh: Math.round(median * 100) / 100,
            mad_kwh: Math.round(mad * 100) / 100,
            robust_z_score: Math.round(robustZ * 100) / 100,
            threshold_upper_kwh: Math.round(upperCutoff * 100) / 100,
            threshold_lower_kwh: Math.round(lowerCutoff * 100) / 100,
            bin_sample_count: stats.count,
            hour_of_day: hourOfDay,
            day_of_week: dayOfWeek,
            reason: `Reading (${r.consumption_kwh} kWh) dropped significantly below expected baseline (${median.toFixed(
              1
            )} kWh). Potential sensor disconnect or unplanned outage.`,
            investigation_hypothesis: 'Inspect meter connectivity and power distribution feeder status.',
            excess_kwh: 0,
            potential_cost_exposure_usd: 0,
          },
        });
      }
    }
  }

  const totalCostExposure = Math.round(totalExcessKwh * tariffRate * 100) / 100;

  return {
    anomalies: detectedAnomalies,
    totalEvaluated: readings.length,
    totalFlaggedCount: detectedAnomalies.length,
    totalExcessKwh: Math.round(totalExcessKwh * 100) / 100,
    totalPotentialCostExposureUsd: totalCostExposure,
  };
}
