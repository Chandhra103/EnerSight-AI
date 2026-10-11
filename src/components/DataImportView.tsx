/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Globe,
  Info,
  Layers,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  BuildingMetadata,
  DatasetBundle,
  DataValidationReport,
  EnergyReading,
} from '../types/energy.ts';
import { parseEnergyCsv } from '../utils/csvParser.ts';
import { validateEnergyDataset } from '../utils/validation.ts';
import { DatasetKey, NavTab } from './Navbar.tsx';

interface DataImportViewProps {
  onLoadCustomDataset: (bundle: DatasetBundle) => void;
  activeDatasetKey: DatasetKey;
  onSelectDataset: (key: DatasetKey) => void;
  bdg2Dataset: DatasetBundle | null;
  syntheticDataset: DatasetBundle | null;
  uploadedDataset: DatasetBundle | null;
  isSimulating: boolean;
  simIndex: number;
  totalSimReadings: number;
  simSpeedMs: number;
  lastProcessedTimestamp?: string;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResetSimulation: () => void;
  onChangeSimSpeed: (speedMs: number) => void;
  onNavigateTab: (tab: NavTab) => void;
}

export const DataImportView: React.FC<DataImportViewProps> = ({
  onLoadCustomDataset,
  activeDatasetKey,
  onSelectDataset,
  bdg2Dataset,
  syntheticDataset,
  uploadedDataset,
  isSimulating,
  simIndex,
  totalSimReadings,
  simSpeedMs,
  lastProcessedTimestamp,
  onStartSimulation,
  onPauseSimulation,
  onResetSimulation,
  onChangeSimSpeed,
  onNavigateTab,
}) => {
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [validationReport, setValidationReport] = useState<DataValidationReport | null>(null);
  const [sanitizedReadings, setSanitizedReadings] = useState<EnergyReading[]>([]);
  const [extractedBuildings, setExtractedBuildings] = useState<BuildingMetadata[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isLoadedToWorkspace, setIsLoadedToWorkspace] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoadedToWorkspace(false);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      processCsv(text, file.name);
    };
    reader.readAsText(file);
  };

  const processCsv = (text: string, name: string) => {
    const parseRes = parseEnergyCsv(text);
    setParseErrors(parseRes.parseErrors);

    if (parseRes.parseErrors.length > 0) {
      setValidationReport(null);
      setSanitizedReadings([]);
      return;
    }

    const valRes = validateEnergyDataset(parseRes.readings);
    setValidationReport(valRes.report);
    setSanitizedReadings(valRes.sanitizedReadings);
    setExtractedBuildings(parseRes.buildings);
  };

  const loadSampleCustomCsv = () => {
    const rows = [
      'timestamp,consumption_kwh,building_id,primary_use,floor_area_sqft',
      '2026-06-01T00:00:00-04:00,42.5,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T01:00:00-04:00,41.8,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T02:00:00-04:00,42.0,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T08:00:00-04:00,120.5,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T12:00:00-04:00,165.2,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T14:00:00-04:00,172.0,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T18:00:00-04:00,95.4,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-01T22:00:00-04:00,44.1,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-02T02:00:00-04:00,43.0,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-02T10:00:00-04:00,155.0,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-02T14:00:00-04:00,310.0,CUSTOM_OFFICE_01,Office,45000', // Injected peak surge
      '2026-06-02T22:00:00-04:00,43.8,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-03T02:00:00-04:00,42.9,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-03T10:00:00-04:00,158.4,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-03T14:00:00-04:00,162.1,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-03T22:00:00-04:00,118.0,CUSTOM_OFFICE_01,Office,45000', // Injected off-hours leak
      '2026-06-04T02:00:00-04:00,42.5,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-04T12:00:00-04:00,160.0,CUSTOM_OFFICE_01,Office,45000',
      '2026-06-05T00:00:00-04:00,42.1,CUSTOM_OFFICE_01,Office,45000',
    ];
    const text = rows.join('\n');
    setFileName('sample_custom_facility.csv');
    setCsvContent(text);
    setIsLoadedToWorkspace(false);
    processCsv(text, 'sample_custom_facility.csv');
  };

  const handleCommitToWorkspace = () => {
    if (sanitizedReadings.length === 0) return;

    const bundle: DatasetBundle = {
      provenance: {
        source_name: `User Upload (${fileName || 'Custom File'})`,
        citation: 'Client-side ingested CSV dataset',
        license: 'Private / User Owned',
        is_synthetic: false,
        timezone: 'Local Offset',
        timezone_offset: '-04:00',
        time_range_start: sanitizedReadings[0]?.timestamp || '',
        time_range_end: sanitizedReadings[sanitizedReadings.length - 1]?.timestamp || '',
        total_hours: sanitizedReadings.length,
        building_count: extractedBuildings.length,
        total_readings: sanitizedReadings.length,
      },
      buildings: extractedBuildings,
      readings: sanitizedReadings,
    };

    onLoadCustomDataset(bundle);
    setIsLoadedToWorkspace(true);
  };

  // Determine active human readable label
  const activeSourceLabel =
    activeDatasetKey === 'bdg2'
      ? 'Preloaded BDG2 Sample (Real Public Data)'
      : activeDatasetKey === 'simulated_live'
      ? 'Simulated Live Data (Progressive Stream)'
      : activeDatasetKey === 'uploaded'
      ? 'Custom User CSV Upload'
      : 'Diagnostic Synthetic Faults';

  const simPercent = Math.min(100, Math.round((simIndex / Math.max(1, totalSimReadings)) * 100));

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-700" />
            Data Sources & Ingestion Pipeline
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Choose an energy data source, audit mathematical integrity, and trace interval ingestion into the live analytical dashboard.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
          <span className="text-slate-500 font-medium">Selected Source:</span>
          <span className="font-bold text-blue-700">{activeSourceLabel}</span>
        </div>
      </div>

      {/* Pipeline Flow Visualization Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            <Layers className="w-4 h-4 text-blue-600" />
            End-to-End Processing Architecture
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Last Processed Timestamp:{' '}
            <strong className="text-slate-900">
              {lastProcessedTimestamp || '2017-05-31 23:00:00-04:00'}
            </strong>
          </div>
        </div>

        {/* Horizontal Flow Diagram */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 relative text-xs">
          {/* Step 1: Data Source */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-1 relative">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-900 uppercase text-[10px] tracking-wide">
                1. Data Source
              </span>
              <span className="w-2 h-2 rounded-full bg-blue-600" />
            </div>
            <p className="font-semibold text-slate-900 text-xs">
              {activeDatasetKey === 'bdg2'
                ? 'BDG2 Public Repository'
                : activeDatasetKey === 'simulated_live'
                ? 'Simulated Stream Feed'
                : activeDatasetKey === 'uploaded'
                ? 'Client CSV Stream'
                : 'Diagnostic Benchmark'}
            </p>
            <p className="text-[11px] text-slate-500">
              {activeDatasetKey === 'simulated_live'
                ? `${simIndex} of ${totalSimReadings} arrived`
                : 'Interval electricity timeseries (kWh)'}
            </p>
          </div>

          {/* Step 2: Validation */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 uppercase text-[10px] tracking-wide">
                2. Validation
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
            </div>
            <p className="font-semibold text-slate-900 text-xs">Rules V1–V6 Engine</p>
            <p className="text-[11px] text-slate-500">
              ISO timestamps, non-negative, dedupe & outlier review
            </p>
          </div>

          {/* Step 3: Anomaly Detection */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900 uppercase text-[10px] tracking-wide">
                3. Anomaly Engine
              </span>
              <span className="w-2 h-2 rounded-full bg-purple-600" />
            </div>
            <p className="font-semibold text-slate-900 text-xs">Contextual Median / MAD</p>
            <p className="text-[11px] text-slate-500">
              Day-Type × Hour bins (Z &gt; 3.0 threshold)
            </p>
          </div>

          {/* Step 4: Dashboard */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wide">
                4. Dashboard
              </span>
              <span className="w-2 h-2 rounded-full bg-slate-500" />
            </div>
            <p className="font-semibold text-slate-900 text-xs">Live Interactive Views</p>
            <p className="text-[11px] text-slate-500">
              Timeseries charts, EUI comparisons & dual ledger
            </p>
          </div>
        </div>
      </div>

      {/* 3 Core Data Sources Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Source 1: Preloaded BDG2 Sample */}
        <div
          className={`bg-white rounded-2xl border p-6 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
            activeDatasetKey === 'bdg2'
              ? 'border-blue-500 ring-2 ring-blue-500/10'
              : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Real Data (CC BY 4.0)
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Preloaded BDG2 Sample</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Empirical hourly measurements from the Building Data Genome Project 2 (Miller et al., Nature 2020).
                Features 3 higher-education facilities over 61 days (4,392 readings, 100% complete, 0 nulls).
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Facilities:</span>
                <strong className="text-slate-900">3 Buildings (Panther Site)</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Readings Count:</span>
                <strong className="font-mono text-blue-700">4,392 kWh intervals</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Timezone:</span>
                <span className="font-mono text-slate-700">US/Eastern (-04:00 EDT)</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            {activeDatasetKey === 'bdg2' ? (
              <button
                type="button"
                disabled
                className="w-full py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold cursor-default flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Currently Active Dataset
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectDataset('bdg2')}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                Load BDG2 Sample &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Source 2: CSV Upload */}
        <div
          className={`bg-white rounded-2xl border p-6 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
            activeDatasetKey === 'uploaded'
              ? 'border-indigo-500 ring-2 ring-indigo-500/10'
              : 'border-slate-200 hover:border-indigo-300'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                Custom User Ingest
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-base">CSV File Upload</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload your organization's interval meter logs or bills. Runs 100% locally in your browser with automatic column mapping, duplicate resolution, and schema validation.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Upload Status:</span>
                <strong className={uploadedDataset ? 'text-emerald-700' : 'text-slate-500'}>
                  {uploadedDataset ? `Ready (${uploadedDataset.readings.length} rows)` : 'No file selected'}
                </strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Privacy:</span>
                <strong className="text-slate-700">100% In-Browser (Zero Leak)</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Validation:</span>
                <span className="text-slate-700">Rules V1–V6 Audited</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={loadSampleCustomCsv}
              className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Load Demo CSV
            </button>
            <label className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold text-center shadow-xs transition-colors cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Source 3: Simulated Live Data */}
        <div
          className={`bg-white rounded-2xl border p-6 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
            activeDatasetKey === 'simulated_live'
              ? 'border-purple-500 ring-2 ring-purple-500/10'
              : 'border-slate-200 hover:border-purple-300'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <Radio className="w-5 h-5" />
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isSimulating
                    ? 'bg-purple-100 text-purple-900 border border-purple-200'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-purple-600 animate-ping' : 'bg-slate-400'}`} />
                {isSimulating ? 'STREAMING LIVE' : 'STREAM READY'}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">Simulated Live Data</h3>
                <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded uppercase">
                  SIMULATED DATA
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Progressively streams interval meter readings into the engine at a configurable interval.
                Demonstrates real-time anomaly detection as new hours arrive without requiring live physical IoT hardware.
              </p>
            </div>

            {/* Simulation Progress & Speed */}
            <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-medium">Stream Progress:</span>
                <span className="font-mono font-bold text-purple-800">
                  {simIndex} / {totalSimReadings} readings ({simPercent}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-purple-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${simPercent}%` }}
                />
              </div>

              {/* Speed selector */}
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-600">
                <span>Ingestion Rate:</span>
                <div className="flex items-center gap-1">
                  {[
                    { label: '500ms', ms: 500 },
                    { label: '1s', ms: 1000 },
                    { label: '2s', ms: 2000 },
                  ].map((s) => (
                    <button
                      key={s.ms}
                      type="button"
                      onClick={() => onChangeSimSpeed(s.ms)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        simSpeedMs === s.ms
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-purple-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Simulation Controls Strip */}
          <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
            {!isSimulating ? (
              <button
                type="button"
                onClick={() => {
                  onSelectDataset('simulated_live');
                  onStartSimulation();
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Start Stream
              </button>
            ) : (
              <button
                type="button"
                onClick={onPauseSimulation}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
              </button>
            )}

            <button
              type="button"
              onClick={onResetSimulation}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs transition-colors cursor-pointer"
              title="Reset Stream to Beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectDataset('simulated_live');
                onNavigateTab('dashboard');
              }}
              className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 rounded-xl text-xs font-semibold cursor-pointer"
              title="View on Dashboard"
            >
              View &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* CSV File Validation Audit Report (Visible when user parses a CSV) */}
      {validationReport && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-900 text-base">
                  Automated CSV Ingestion Audit (Rules V1–V6)
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Verified mathematical integrity before admitting records to analytical baseline.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  validationReport.is_valid
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {validationReport.is_valid ? 'Validation Passed' : 'Validation Failed'}
              </span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                Provenance: {validationReport.verified_provenance_type}
              </span>
            </div>
          </div>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Rows Evaluated</span>
              <p className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                {validationReport.total_records_evaluated}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Accepted Rows</span>
              <p className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                {validationReport.accepted_records_count}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Rejected Rows</span>
              <p className="text-lg font-bold font-mono text-red-600 mt-0.5">
                {validationReport.rejected_records_count}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Warnings / Gaps</span>
              <p className="text-lg font-bold font-mono text-amber-700 mt-0.5">
                {validationReport.warnings.length}
              </p>
            </div>
          </div>

          {/* Warnings and Disclaimers Log */}
          {validationReport.warnings.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Ingestion Audit Warnings ({validationReport.warnings.length})
              </div>
              <ul className="space-y-1 text-amber-800 list-disc list-inside">
                {validationReport.warnings.map((w, i) => (
                  <li key={i}>
                    <strong>[{w.rule_id}]:</strong> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors Log (if any rejected) */}
          {validationReport.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs space-y-2">
              <div className="font-bold text-red-900 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-600" />
                Understandable Validation Errors ({validationReport.errors.length})
              </div>
              <ul className="space-y-1 text-red-800 list-disc list-inside">
                {validationReport.errors.map((e, i) => (
                  <li key={i}>
                    <strong>[{e.rule_id} Row {e.row_number}]:</strong> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action button: Commit to Active Workspace */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Ready to analyze {sanitizedReadings.length} validated readings across {extractedBuildings.length} buildings.
            </p>

            <button
              type="button"
              disabled={sanitizedReadings.length === 0}
              onClick={handleCommitToWorkspace}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all ${
                isLoadedToWorkspace
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLoadedToWorkspace ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Active in Workspace! (Check Dashboard)
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Load into Active Workspace &rarr;
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
