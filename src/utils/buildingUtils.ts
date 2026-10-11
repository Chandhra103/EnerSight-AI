/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BuildingMetadata, DetectedAnomaly } from '../types/energy.ts';

/**
 * Standard known alias fallback mapping based on official BDG2 / Benchmark specifications.
 */
const KNOWN_BUILDING_ALIASES: Record<string, { displayName: string; primaryUse: string }> = {
  Panther_education_Jerome: {
    displayName: 'North Science & Research Center (Alias)',
    primaryUse: 'Education / Research Lab',
  },
  Panther_education_Vincent: {
    displayName: 'Central Lecture Auditorium (Alias)',
    primaryUse: 'Education / Classroom Hall',
  },
  Panther_office_Karla: {
    displayName: 'University Administration Annex (Alias)',
    primaryUse: 'Office / Administration',
  },
  SIM_BLDG_01: {
    displayName: 'Metropolitan Innovation Hub (Synthetic Benchmark)',
    primaryUse: 'Commercial / Innovation Hub',
  },
};

/**
 * Resolves the user-configured or official display alias for a building,
 * ensuring consistent naming throughout all views in the application.
 */
export function getBuildingDisplayName(
  buildingId: string,
  buildings?: BuildingMetadata[]
): string {
  if (!buildingId) return 'Unknown Facility';

  if (buildings && buildings.length > 0) {
    const match = buildings.find((b) => b.building_id === buildingId);
    if (match && match.display_name) {
      return match.display_name;
    }
  }

  if (KNOWN_BUILDING_ALIASES[buildingId]) {
    return KNOWN_BUILDING_ALIASES[buildingId].displayName;
  }

  // Format clean fallback for custom uploaded buildings (e.g. CUSTOM_OFFICE_01 -> Custom Office 01)
  return buildingId
    .replace(/^CUSTOM_/i, 'Custom Facility: ')
    .replace(/_/g, ' ');
}

/**
 * Formats a signed robust MAD score without accidental "+-" artifacts.
 * e.g. +3.8 MAD or -3.8 MAD
 */
export function formatSignedMadScore(score: number): string {
  const rounded = score.toFixed(1);
  return score > 0 ? `+${rounded} MAD` : `${rounded} MAD`;
}

/**
 * Formats signed difference between observed and baseline in kWh.
 * e.g. +14.2 kWh or -8.5 kWh
 */
export function formatSignedKwhDiff(diff: number): string {
  const rounded = diff.toFixed(1);
  return diff > 0 ? `+${rounded} kWh` : `${rounded} kWh`;
}

/**
 * Formats signed percentage difference.
 * e.g. +25.4% or -15.0%
 */
export function formatSignedPercentage(pct: number, decimals: number = 1): string {
  const rounded = Number.isInteger(pct) ? pct.toString() : pct.toFixed(decimals);
  return pct > 0 ? `+${rounded}%` : `${rounded}%`;
}

/**
 * Formats a plain English, non-technical explanation for facility operators
 * and sustainability stakeholders.
 */
export function formatAnomalyPlainEnglish(anomaly: DetectedAnomaly): string {
  const { consumption_kwh, explanation, anomaly_type } = anomaly;
  const baseline = explanation.baseline_median_kwh;
  const excess = explanation.excess_kwh;
  const diffKwh = consumption_kwh - baseline;
  const diffPct = baseline > 0 ? ((consumption_kwh - baseline) / baseline) * 100 : 0;
  const signedDiffKwh = formatSignedKwhDiff(diffKwh);
  const signedPct = formatSignedPercentage(diffPct);

  switch (anomaly_type) {
    case 'OFF_HOURS_SURGE':
      return `Unusually high off-hours baseload: measured at ${consumption_kwh.toFixed(1)} kWh, which is ${signedDiffKwh} (${signedPct}) higher than the normal expected level of ${baseline.toFixed(1)} kWh during unoccupied hours.`;
    
    case 'HIGH_PEAK':
      return `Unusually high electricity spike: measured at ${consumption_kwh.toFixed(1)} kWh during operational hours, exceeding the expected normal baseline of ${baseline.toFixed(1)} kWh by ${signedDiffKwh} (${signedPct}).`;
    
    case 'BASELOAD_DRIFT':
      return `Persistent baseload drift: consumption is running consistently above expected night/standby threshold (${baseline.toFixed(1)} kWh), averaging ${consumption_kwh.toFixed(1)} kWh (${signedDiffKwh}, ${signedPct}).`;
    
    case 'UNUSUAL_DROP':
      return `Unusually low electricity reading: consumption dropped sharply to ${consumption_kwh.toFixed(1)} kWh (${signedDiffKwh}, ${signedPct}) compared with the normal baseline of ${baseline.toFixed(1)} kWh (potential telemetry disconnect or unexpected outage).`;
    
    default:
      return `Electricity usage (${consumption_kwh.toFixed(1)} kWh) deviated by ${signedDiffKwh} (${signedPct}) from the normal expected baseline (${baseline.toFixed(1)} kWh).`;
  }
}

/**
 * Short, human-readable headline for anomaly triage cards.
 */
export function getAnomalyHeadline(anomaly: DetectedAnomaly): string {
  const { anomaly_type, severity } = anomaly;
  switch (anomaly_type) {
    case 'OFF_HOURS_SURGE':
      return 'Unexpected Off-Hours Consumption';
    case 'HIGH_PEAK':
      return severity === 'critical' ? 'Severe Peak Demand Spike' : 'Elevated Daytime Demand';
    case 'BASELOAD_DRIFT':
      return 'Gradual Baseload Drift';
    case 'UNUSUAL_DROP':
      return 'Unplanned Drop / Sensor Outage';
    default:
      return 'Unusual Consumption Deviation';
  }
}
