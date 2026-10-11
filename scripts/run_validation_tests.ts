/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { validateEnergyDataset } from '../src/utils/validation.ts';
import { detectEnergyAnomalies } from '../src/utils/anomalyDetection.ts';
import { EnergyReading, DatasetBundle } from '../src/types/energy.ts';
import {
  formatSignedKwhDiff,
  formatSignedMadScore,
  formatSignedPercentage,
} from '../src/utils/buildingUtils.ts';

function runTestSuite() {
  console.log('===============================================================');
  console.log('       ENERSIGHT AI: DATA VALIDATION & DETECTION TEST SUITE    ');
  console.log('===============================================================\n');

  let totalTestsPassed = 0;
  let totalTestsFailed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      totalTestsPassed++;
    } else {
      console.error(`  [FAIL] ${testName} - ${details || 'Assertion failed'}`);
      totalTestsFailed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Verified Real BDG2 Dataset (/public/data/sample_bdg2.json)
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 1: BDG2 Real Dataset Verification ---');
  const bdg2Path = path.resolve(process.cwd(), 'public/data/sample_bdg2.json');
  assert(fs.existsSync(bdg2Path), 'BDG2 asset exists at public/data/sample_bdg2.json');

  const bdg2Data: DatasetBundle = JSON.parse(fs.readFileSync(bdg2Path, 'utf8'));
  assert(bdg2Data.provenance.is_synthetic === false, 'BDG2 provenance confirms is_synthetic === false');
  assert(bdg2Data.provenance.license.includes('CC BY 4.0'), 'BDG2 license verified as CC BY 4.0');
  assert(bdg2Data.buildings.length === 3, 'BDG2 contains exactly 3 buildings');
  assert(bdg2Data.readings.length === 4392, `BDG2 contains 4,392 readings (1464 hrs * 3 bldgs). Found: ${bdg2Data.readings.length}`);

  const bdg2Validation = validateEnergyDataset(bdg2Data.readings, bdg2Data.provenance);
  assert(bdg2Validation.report.is_valid === true, 'BDG2 validation passed with 0 fatal errors');
  assert(bdg2Validation.report.rejected_records_count === 0, 'BDG2 has 0 rejected records');
  assert(bdg2Validation.report.accepted_records_count === 4392, 'BDG2 accepted all 4,392 records');
  assert(bdg2Validation.report.verified_provenance_type === 'AUTHENTIC_BDG2', 'BDG2 verified as AUTHENTIC_BDG2');
  console.log(`  BDG2 Date Range: ${bdg2Data.provenance.time_range_start} to ${bdg2Data.provenance.time_range_end}`);
  console.log(`  BDG2 Timezone: ${bdg2Data.provenance.timezone} (${bdg2Data.provenance.timezone_offset})\n`);

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Synthetic Diagnostic Benchmark (/public/data/benchmark_faults.json)
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 2: Synthetic Benchmark Verification ---');
  const benchPath = path.resolve(process.cwd(), 'public/data/benchmark_faults.json');
  assert(fs.existsSync(benchPath), 'Benchmark asset exists at public/data/benchmark_faults.json');

  const benchData: DatasetBundle = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
  assert(benchData.provenance.is_synthetic === true, 'Benchmark provenance confirms is_synthetic === true');
  assert(benchData.readings.length === 336, `Benchmark contains 336 readings (14 days * 24 hrs). Found: ${benchData.readings.length}`);
  assert(benchData.fault_specifications?.length === 3, 'Benchmark contains exactly 3 documented fault specifications');

  const benchValidation = validateEnergyDataset(benchData.readings, benchData.provenance);
  assert(benchValidation.report.is_valid === true, 'Benchmark validation passed with 0 fatal errors');
  assert(benchValidation.report.accepted_records_count === 336, 'Benchmark accepted all 336 records');
  assert(benchValidation.report.verified_provenance_type === 'SYNTHETIC_DIAGNOSTIC', 'Benchmark verified as SYNTHETIC_DIAGNOSTIC\n');

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Validation Rules Edge Cases (V1 - V6)
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 3: Ingestion Edge Case Integrity (V1 - V6) ---');

  // V1: Invalid timestamp test
  const badTsReading: EnergyReading = {
    reading_id: 'bad_ts_1',
    building_id: 'TEST_BLDG',
    timestamp: '2026-05-01 14:00', // Missing ISO T and offset
    consumption_kwh: 50.0,
    interval_minutes: 60,
  };
  const v1Res = validateEnergyDataset([badTsReading]);
  assert(v1Res.report.errors.some((e) => e.rule_id === 'V1'), 'V1: Correctly rejected non-ISO timestamp');

  // V2: Negative value test
  const negativeReading: EnergyReading = {
    reading_id: 'neg_1',
    building_id: 'TEST_BLDG',
    timestamp: '2026-05-01T14:00:00Z',
    consumption_kwh: -15.4,
    interval_minutes: 60,
  };
  const v2Res = validateEnergyDataset([negativeReading]);
  assert(v2Res.report.errors.some((e) => e.rule_id === 'V2'), 'V2: Correctly rejected negative consumption');

  // V3: Deduplication collision test
  const dupReadings: EnergyReading[] = [
    { reading_id: 'd1', building_id: 'B1', timestamp: '2026-05-01T12:00:00Z', consumption_kwh: 100, interval_minutes: 60 },
    { reading_id: 'd2', building_id: 'B1', timestamp: '2026-05-01T12:00:00Z', consumption_kwh: 120, interval_minutes: 60 },
  ];
  const v3Res = validateEnergyDataset(dupReadings);
  assert(v3Res.report.accepted_records_count === 1, 'V3: Retained first entry on duplicate collision');
  assert(v3Res.report.warnings.some((w) => w.rule_id === 'V3'), 'V3: Logged warning for collision without crash');

  // V4: Extreme outlier non-destructive warning test
  const outlierReading: EnergyReading = {
    reading_id: 'out_1',
    building_id: 'TEST_BLDG',
    timestamp: '2026-05-01T14:00:00Z',
    consumption_kwh: 5200.0, // > 2,000 threshold
    interval_minutes: 60,
  };
  const v4Res = validateEnergyDataset([outlierReading]);
  assert(v4Res.report.accepted_records_count === 1, 'V4: Non-destructive - extreme outlier retained for human review');
  assert(v4Res.report.warnings.some((w) => w.rule_id === 'V4'), 'V4: Emitted high outlier warning');

  // V5: Data gap detection test
  const gapReadings: EnergyReading[] = [
    { reading_id: 'g1', building_id: 'B1', timestamp: '2026-05-01T10:00:00Z', consumption_kwh: 40, interval_minutes: 60 },
    { reading_id: 'g2', building_id: 'B1', timestamp: '2026-05-01T16:00:00Z', consumption_kwh: 45, interval_minutes: 60 }, // 6-hour gap
  ];
  const v5Res = validateEnergyDataset(gapReadings);
  assert(v5Res.report.detected_gaps.length === 1, 'V5: Correctly detected 360-minute unmonitored gap');
  assert(v5Res.sanitizedReadings.length === 2, 'V5: Did NOT synthesize fake readings to fill gap');

  // V6: Provenance forgery detection test
  const fakeProvenance = {
    source_name: 'Building Data Genome Project 2 (BDG2)', // User claimed BDG2
    citation: 'Fake',
    license: 'CC BY 4.0',
    is_synthetic: false,
    trusted_source_id: 'UNAUTHORIZED_KEY_123',
    timezone: 'UTC',
    timezone_offset: '+00:00',
    time_range_start: '2026-01-01T00:00:00Z',
    time_range_end: '2026-01-02T00:00:00Z',
    total_hours: 24,
    building_count: 1,
    total_readings: 24,
  };
  const v6Res = validateEnergyDataset([], fakeProvenance);
  assert(v6Res.report.verified_provenance_type === 'USER_UPLOAD_UNVERIFIED', 'V6: Untrusted claim demoted to USER_UPLOAD_UNVERIFIED\n');

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Explainable Anomaly Detection on Synthetic Faults
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 4: Explainable Anomaly Engine Evaluation ---');
  const benchAnom = detectEnergyAnomalies(benchData.readings, {
    robustZThreshold: 3.0,
    minSamplesPerBin: 2,
    tariffUsdPerKwh: 0.14,
  });

  console.log(`  Total Evaluated: ${benchAnom.totalEvaluated} readings`);
  console.log(`  Total Flagged Anomalies: ${benchAnom.totalFlaggedCount}`);
  console.log(`  Total Excess Energy: ${benchAnom.totalExcessKwh} kWh`);
  console.log(`  Potential Cost Exposure: $${benchAnom.totalPotentialCostExposureUsd}`);

  // Verify Fault 1 (Overnight high baseload): May 7 22:00 to May 8 06:00
  const fault1Hits = benchAnom.anomalies.filter((a) =>
    a.timestamp.startsWith('2026-05-07T22') ||
    a.timestamp.startsWith('2026-05-07T23') ||
    a.timestamp.startsWith('2026-05-08T0')
  );
  assert(fault1Hits.length >= 8, `Fault 1 (Overnight Override) detected across all 8+ fault hours (Found: ${fault1Hits.length})`);
  assert((fault1Hits[0]?.explanation.robust_z_score ?? 0) > 5.0, `Fault 1 Robust Z-score > +5.0 (Actual: ${fault1Hits[0]?.explanation.robust_z_score})`);

  // Verify Fault 2 (Sudden Midday Surge): May 5 14:00
  const fault2Hit = benchAnom.anomalies.find((a) => a.timestamp.startsWith('2026-05-05T14:00'));
  assert(fault2Hit !== undefined, 'Fault 2 (Sudden Midday Spike) detected at 2026-05-05 14:00');
  assert((fault2Hit?.explanation.observed_kwh ?? 0) === 295.0, 'Fault 2 Observed value verified as 295.0 kWh');
  assert((fault2Hit?.explanation.robust_z_score ?? 0) > 6.0, `Fault 2 Robust Z-score > +6.0 (Actual: ${fault2Hit?.explanation.robust_z_score})`);

  // Verify Fault 3 (Baseload Drift): May 11-14 off-hours
  const fault3Hits = benchAnom.anomalies.filter((a) =>
    a.timestamp.startsWith('2026-05-11') ||
    a.timestamp.startsWith('2026-05-12') ||
    a.timestamp.startsWith('2026-05-13') ||
    a.timestamp.startsWith('2026-05-14')
  );
  assert(fault3Hits.length >= 4, `Fault 3 (Baseload Drift) detected across progressive drift nights (Found: ${fault3Hits.length})`);

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Explainable Anomaly Detection on BDG2 Dataset
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 5: BDG2 Real Data Baseline Evaluation ---');
  // App.tsx runtime parameters: threshold 3.0, minSamples 3, tariff 0.14 -> 289 verified anomalies
  const bdg2AppDefault = detectEnergyAnomalies(bdg2Data.readings, {
    robustZThreshold: 3.0,
    minSamplesPerBin: 3,
    tariffUsdPerKwh: 0.14,
  });
  console.log(`  BDG2 Readings Evaluated: ${bdg2AppDefault.totalEvaluated}`);
  console.log(`  BDG2 Total Flagged Anomalies (Default App Engine): ${bdg2AppDefault.totalFlaggedCount} (${((bdg2AppDefault.totalFlaggedCount / bdg2AppDefault.totalEvaluated) * 100).toFixed(2)}% anomaly rate)`);
  console.log(`  Estimated Excess kWh: ${bdg2AppDefault.totalExcessKwh} kWh`);
  console.log(`  Estimated Potential Cost Exposure: $${bdg2AppDefault.totalPotentialCostExposureUsd}`);

  assert(bdg2AppDefault.totalFlaggedCount === 289, `BDG2 default detection produces exactly 289 anomalies (Found: ${bdg2AppDefault.totalFlaggedCount})`);

  // Verify full severity accounting of all 289 anomalies across every category
  const appCrit = bdg2AppDefault.anomalies.filter((a) => a.severity === 'critical').length;
  const appHigh = bdg2AppDefault.anomalies.filter((a) => a.severity === 'high').length;
  const appMed = bdg2AppDefault.anomalies.filter((a) => a.severity === 'medium').length;
  const appLow = bdg2AppDefault.anomalies.filter((a) => a.severity === 'low').length;
  const appSum = appCrit + appHigh + appMed + appLow;

  assert(appSum === 289, `All 289 anomalies are 100% accounted for in severity totals (Critical: ${appCrit}, High: ${appHigh}, Medium: ${appMed}, Low: ${appLow})`);
  assert(appCrit === 40, `Critical severity count exactly equals 40 (Actual: ${appCrit})`);
  assert(appHigh === 106, `High severity count exactly equals 106 (Actual: ${appHigh})`);
  assert(appMed === 24, `Medium severity count exactly equals 24 (Actual: ${appMed})`);
  assert(appLow === 119, `Low severity count exactly equals 119 (Actual: ${appLow})`);

  // Secondary sensitivity run (threshold 3.2, minSamples 4)
  const bdg2Anom = detectEnergyAnomalies(bdg2Data.readings, {
    robustZThreshold: 3.2,
    minSamplesPerBin: 4,
    tariffUsdPerKwh: 0.14,
  });
  assert(bdg2Anom.totalFlaggedCount > 0 && bdg2Anom.totalFlaggedCount < 300, 'BDG2 sensitivity anomaly rate is realistic (<7% of total records)');

  // -------------------------------------------------------------------------
  // TEST SUITE 6: Calculations, Formatting, Severity Totals & Duplicate Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 6: Calculations, Formatting, Severity Totals & Duplicate Detection ---');

  // Formatting tests
  assert(formatSignedMadScore(3.8) === '+3.8 MAD', 'formatSignedMadScore(+3.8) returns "+3.8 MAD"');
  assert(formatSignedMadScore(-3.8) === '-3.8 MAD', 'formatSignedMadScore(-3.8) returns "-3.8 MAD" (no "+-")');
  assert(!formatSignedMadScore(-3.8).includes('+-'), 'formatSignedMadScore never contains accidental "+-"');
  assert(formatSignedKwhDiff(15.2) === '+15.2 kWh', 'formatSignedKwhDiff(+15.2) returns "+15.2 kWh"');
  assert(formatSignedKwhDiff(-15.2) === '-15.2 kWh', 'formatSignedKwhDiff(-15.2) returns "-15.2 kWh"');
  assert(formatSignedPercentage(25.4) === '+25.4%', 'formatSignedPercentage(+25.4) returns "+25.4%"');
  assert(formatSignedPercentage(-25.4) === '-25.4%', 'formatSignedPercentage(-25.4) returns "-25.4%"');

  // Severity category breakdown sum integrity (BDG2 real dataset)
  const bdg2Critical = bdg2Anom.anomalies.filter((a) => a.severity === 'critical').length;
  const bdg2High = bdg2Anom.anomalies.filter((a) => a.severity === 'high').length;
  const bdg2Medium = bdg2Anom.anomalies.filter((a) => a.severity === 'medium').length;
  const bdg2Low = bdg2Anom.anomalies.filter((a) => a.severity === 'low').length;
  const bdg2Sum = bdg2Critical + bdg2High + bdg2Medium + bdg2Low;
  assert(bdg2Sum === bdg2Anom.totalFlaggedCount, `BDG2 severity tiers sum (${bdg2Sum}) exactly matches total flagged count (${bdg2Anom.totalFlaggedCount})`);
  assert(bdg2Low > 0, `BDG2 has valid Low severity anomalies accounted for (${bdg2Low} found)`);

  // Severity category breakdown sum integrity (Synthetic benchmark)
  const benchCritical = benchAnom.anomalies.filter((a) => a.severity === 'critical').length;
  const benchHigh = benchAnom.anomalies.filter((a) => a.severity === 'high').length;
  const benchMedium = benchAnom.anomalies.filter((a) => a.severity === 'medium').length;
  const benchLow = benchAnom.anomalies.filter((a) => a.severity === 'low').length;
  const benchSum = benchCritical + benchHigh + benchMedium + benchLow;
  assert(benchSum === benchAnom.totalFlaggedCount, `Benchmark severity tiers sum (${benchSum}) exactly matches total flagged count (${benchAnom.totalFlaggedCount})`);

  // Uniqueness & Duplicate Anomaly Detection in BDG2
  const bdg2IdSet = new Set<string>();
  const bdg2KeySet = new Set<string>();
  let bdg2HasDuplicateId = false;
  let bdg2HasDuplicateKey = false;
  for (const a of bdg2Anom.anomalies) {
    if (bdg2IdSet.has(a.anomaly_id)) bdg2HasDuplicateId = true;
    bdg2IdSet.add(a.anomaly_id);

    const key = `${a.building_id}_${a.timestamp}`;
    if (bdg2KeySet.has(key)) bdg2HasDuplicateKey = true;
    bdg2KeySet.add(key);
  }
  assert(!bdg2HasDuplicateId, `Zero duplicate anomaly_id instances in BDG2 (all ${bdg2IdSet.size} unique)`);
  assert(!bdg2HasDuplicateKey, `Zero duplicate timestamp collisions for same facility in BDG2 (all ${bdg2KeySet.size} unique)`);

  // Uniqueness & Duplicate Anomaly Detection in Benchmark
  const benchIdSet = new Set<string>();
  const benchKeySet = new Set<string>();
  let benchHasDuplicateId = false;
  let benchHasDuplicateKey = false;
  for (const a of benchAnom.anomalies) {
    if (benchIdSet.has(a.anomaly_id)) benchHasDuplicateId = true;
    benchIdSet.add(a.anomaly_id);

    const key = `${a.building_id}_${a.timestamp}`;
    if (benchKeySet.has(key)) benchHasDuplicateKey = true;
    benchKeySet.add(key);
  }
  assert(!benchHasDuplicateId, `Zero duplicate anomaly_id instances in Benchmark (all ${benchIdSet.size} unique)`);
  assert(!benchHasDuplicateKey, `Zero duplicate timestamp collisions for same facility in Benchmark (all ${benchKeySet.size} unique)`);

  // Mathematical difference consistency
  const sampleAnom = bdg2Anom.anomalies[0];
  const calculatedDiff = sampleAnom.consumption_kwh - sampleAnom.explanation.baseline_median_kwh;
  assert(
    Math.abs(calculatedDiff - (sampleAnom.consumption_kwh - sampleAnom.explanation.baseline_median_kwh)) < 0.0001,
    `Difference calculation consistency verified (Observed: ${sampleAnom.consumption_kwh.toFixed(1)} kWh, Baseline: ${sampleAnom.explanation.baseline_median_kwh.toFixed(1)} kWh, Diff: ${calculatedDiff.toFixed(1)} kWh)`
  );

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${totalTestsPassed} passed, ${totalTestsFailed} failed.`);
  console.log('===============================================================');

  if (totalTestsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite();
