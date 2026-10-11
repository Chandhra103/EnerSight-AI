/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DataValidationReport,
  DetectedGap,
  EnergyReading,
  ProvenanceInfo,
  ValidationError,
  ValidationWarning,
} from '../types/energy.ts';

// ISO-8601 regex accepting either Z or explicit numeric offset like -04:00, +05:30
const ISO_8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

// Trusted signature registry for V6 Provenance Verification
const TRUSTED_PROVENANCE_SIGNATURES: Record<string, { expectedSource: string; isSynthetic: boolean }> = {
  BDG2_PANTHER_2017: {
    expectedSource: 'Building Data Genome Project 2 (BDG2)',
    isSynthetic: false,
  },
  ENERSIGHT_SYNTHETIC_DIAGNOSTIC_V1: {
    expectedSource: 'EnerSight AI Synthetic Diagnostic Suite',
    isSynthetic: true,
  },
};

/**
 * Validates an array of EnergyReadings according to EnerSight AI validation protocol V1-V6.
 */
export function validateEnergyDataset(
  readings: EnergyReading[],
  provenance?: ProvenanceInfo,
  highOutlierThresholdKwh = 2000.0
): { report: DataValidationReport; sanitizedReadings: EnergyReading[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const detectedGaps: DetectedGap[] = [];
  const sanitizedReadings: EnergyReading[] = [];

  // V6: Provenance Verification
  let verifiedProvenanceType: DataValidationReport['verified_provenance_type'] =
    'USER_UPLOAD_UNVERIFIED';

  if (provenance) {
    const trustedKey = provenance.trusted_source_id;
    if (trustedKey && TRUSTED_PROVENANCE_SIGNATURES[trustedKey]) {
      const trusted = TRUSTED_PROVENANCE_SIGNATURES[trustedKey];
      if (
        provenance.source_name === trusted.expectedSource &&
        provenance.is_synthetic === trusted.isSynthetic
      ) {
        verifiedProvenanceType = trusted.isSynthetic
          ? 'SYNTHETIC_DIAGNOSTIC'
          : 'AUTHENTIC_BDG2';
      } else {
        warnings.push({
          rule_id: 'V6',
          message: `Provenance mismatch: Claimed signature ${trustedKey} does not match expected source attributes. Treated as unverified.`,
        });
      }
    } else if (provenance.source_name.toLowerCase().includes('genome') || provenance.source_name.toLowerCase().includes('bdg2')) {
      // User claimed BDG2 without trusted verification signature
      warnings.push({
        rule_id: 'V6',
        message: 'Untrusted provenance claim: Dataset claims BDG2 source but lacks authenticated signature. Categorized as USER_UPLOAD_UNVERIFIED.',
      });
      verifiedProvenanceType = 'USER_UPLOAD_UNVERIFIED';
    } else if (provenance.is_synthetic) {
      verifiedProvenanceType = 'SYNTHETIC_DIAGNOSTIC';
    }
  }

  // Tracking map for V3: Deduplication (building_id + timestamp)
  const seenKeyMap = new Map<string, number>();

  // Tracking last timestamp per building for V5: Gap Detection
  const lastTimestampByBuilding = new Map<string, number>();

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const rowNum = i + 1;

    // V1: Timestamp Integrity (ISO-8601 with Z or explicit offset)
    if (!r.timestamp || typeof r.timestamp !== 'string') {
      errors.push({
        rule_id: 'V1',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Missing or non-string timestamp at row ${rowNum}. Record rejected.`,
        rejected: true,
      });
      continue;
    }

    if (!ISO_8601_REGEX.test(r.timestamp)) {
      errors.push({
        rule_id: 'V1',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Invalid ISO-8601 timestamp format: "${r.timestamp}". Must include Z or explicit offset (e.g. -04:00). Record rejected.`,
        rejected: true,
      });
      continue;
    }

    const parsedDate = new Date(r.timestamp);
    if (isNaN(parsedDate.getTime())) {
      errors.push({
        rule_id: 'V1',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Unparseable date timestamp "${r.timestamp}". Record rejected.`,
        rejected: true,
      });
      continue;
    }

    // V2: Non-Negative Consumption Validation
    if (r.consumption_kwh === null || r.consumption_kwh === undefined || isNaN(r.consumption_kwh)) {
      errors.push({
        rule_id: 'V2',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Missing or non-numeric consumption at row ${rowNum}. Record rejected.`,
        rejected: true,
      });
      continue;
    }

    if (r.consumption_kwh < 0) {
      errors.push({
        rule_id: 'V2',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Negative consumption detected (${r.consumption_kwh} kWh) at row ${rowNum}. Net exports must be separated. Record rejected.`,
        rejected: true,
      });
      continue;
    }

    // V3: Deduplication Protection
    const dedupeKey = `${r.building_id}_${r.timestamp}`;
    if (seenKeyMap.has(dedupeKey)) {
      const firstRow = seenKeyMap.get(dedupeKey);
      warnings.push({
        rule_id: 'V3',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `Duplicate reading for building "${r.building_id}" at timestamp "${r.timestamp}". Retained earlier valid entry from row ${firstRow}; second entry ignored.`,
      });
      continue; // Skip duplicate record to protect baseline
    }
    seenKeyMap.set(dedupeKey, rowNum);

    // V4: Extreme Outlier Warning Bound (Non-destructive)
    if (r.consumption_kwh > highOutlierThresholdKwh) {
      warnings.push({
        rule_id: 'V4',
        record_id: r.reading_id,
        row_number: rowNum,
        message: `High consumption warning: ${r.consumption_kwh} kWh exceeds ${highOutlierThresholdKwh} kWh review threshold. Retained for human inspection.`,
      });
    }

    // V5: Measurement Gap Detection
    const currentMillis = parsedDate.getTime();
    const prevMillis = lastTimestampByBuilding.get(r.building_id);
    if (prevMillis !== undefined) {
      const deltaMinutes = (currentMillis - prevMillis) / (1000 * 60);
      if (deltaMinutes > 90) {
        // Gap detected (> 1.5 hours in an expected hourly stream)
        const prevIso = new Date(prevMillis).toISOString();
        detectedGaps.push({
          building_id: r.building_id,
          start_timestamp: prevIso,
          end_timestamp: r.timestamp,
          gap_minutes: Math.round(deltaMinutes),
        });
        warnings.push({
          rule_id: 'V5',
          record_id: r.reading_id,
          row_number: rowNum,
          message: `Unmonitored interval gap of ${Math.round(deltaMinutes)} minutes detected between ${prevIso} and ${r.timestamp}. No synthetic values injected.`,
        });
      }
    }
    lastTimestampByBuilding.set(r.building_id, currentMillis);

    sanitizedReadings.push(r);
  }

  const report: DataValidationReport = {
    is_valid: errors.length === 0,
    total_records_evaluated: readings.length,
    accepted_records_count: sanitizedReadings.length,
    rejected_records_count: readings.length - sanitizedReadings.length,
    errors,
    warnings,
    detected_gaps: detectedGaps,
    verified_provenance_type: verifiedProvenanceType,
  };

  return { report, sanitizedReadings };
}
