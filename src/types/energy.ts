/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BuildingPrimaryUse =
  | 'Education'
  | 'Office'
  | 'Healthcare'
  | 'Laboratory'
  | 'Residential'
  | 'Commercial'
  | 'Other';

export interface ProvenanceInfo {
  source_name: string;
  citation: string;
  license: string;
  is_synthetic: boolean;
  trusted_source_id?: string;
  doi?: string;
  site_id?: string;
  timezone: string;
  timezone_offset: string;
  time_range_start: string;
  time_range_end: string;
  total_hours: number;
  building_count: number;
  total_readings: number;
  injected_fault_count?: number;
}

export interface BuildingMetadata {
  building_id: string;
  display_name: string;
  organization_id: string;
  primary_use: BuildingPrimaryUse;
  sub_use?: string;
  floor_area_sqft?: number;
  meter_type: string;
  default_tariff_usd_kwh?: number;
}

export interface EnergyReading {
  reading_id: string;
  building_id: string;
  timestamp: string; // ISO-8601 with Z or offset
  original_timestamp?: string;
  consumption_kwh: number;
  interval_minutes: number;
  is_synthetic?: boolean;
  is_simulated_fault?: boolean;
  simulated_fault_id?: string;
  simulated_fault_type?: string;
}

export interface FaultSpecification {
  fault_id: string;
  name: string;
  fault_type: string;
  start_timestamp: string;
  end_timestamp: string;
  duration_hours: number;
  normal_baseline_kwh: number;
  injected_reading_kwh?: number;
  drift_range_kwh?: [number, number];
  expected_robust_z: number;
  description: string;
  suggested_action: string;
}

export interface DatasetBundle {
  provenance: ProvenanceInfo;
  buildings: BuildingMetadata[];
  readings: EnergyReading[];
  fault_specifications?: FaultSpecification[];
}

export interface ValidationError {
  rule_id: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';
  record_id?: string;
  row_number?: number;
  message: string;
  rejected: boolean;
}

export interface ValidationWarning {
  rule_id: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6';
  record_id?: string;
  row_number?: number;
  message: string;
}

export interface DetectedGap {
  building_id: string;
  start_timestamp: string;
  end_timestamp: string;
  gap_minutes: number;
}

export interface DataValidationReport {
  is_valid: boolean;
  total_records_evaluated: number;
  accepted_records_count: number;
  rejected_records_count: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  detected_gaps: DetectedGap[];
  verified_provenance_type: 'AUTHENTIC_BDG2' | 'SYNTHETIC_DIAGNOSTIC' | 'USER_UPLOAD_UNVERIFIED';
}

export interface AnomalyExplanation {
  observed_kwh: number;
  baseline_median_kwh: number;
  mad_kwh: number;
  robust_z_score: number;
  threshold_upper_kwh: number;
  threshold_lower_kwh: number;
  bin_sample_count: number;
  hour_of_day: number;
  day_of_week: number;
  reason: string;
  investigation_hypothesis: string;
  excess_kwh: number;
  potential_cost_exposure_usd: number;
}

export interface DetectedAnomaly {
  anomaly_id: string;
  reading_id: string;
  building_id: string;
  timestamp: string;
  consumption_kwh: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomaly_type: 'HIGH_PEAK' | 'OFF_HOURS_SURGE' | 'BASELOAD_DRIFT' | 'UNUSUAL_DROP';
  explanation: AnomalyExplanation;
  status: 'flagged' | 'investigating' | 'action_taken' | 'resolved' | 'dismissed';
  logged_action_notes?: string;
  verified_savings_kwh?: number;
  verified_savings_usd?: number;
}
