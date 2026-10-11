/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  FileText,
  Info,
  LineChart,
  ShieldAlert,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { BuildingMetadata, DetectedAnomaly, EnergyReading } from '../types/energy.ts';
import {
  formatAnomalyPlainEnglish,
  formatSignedKwhDiff,
  formatSignedMadScore,
  formatSignedPercentage,
  getAnomalyHeadline,
  getBuildingDisplayName,
} from '../utils/buildingUtils.ts';

interface AnomalyDetailModalProps {
  anomaly: DetectedAnomaly | null;
  readings?: EnergyReading[];
  onClose: () => void;
  onUpdateStatus: (
    anomalyId: string,
    status: DetectedAnomaly['status'],
    notes?: string,
    verifiedSavingsKwh?: number
  ) => void;
  tariffRate: number;
  buildings?: BuildingMetadata[];
}

export const AnomalyDetailModal: React.FC<AnomalyDetailModalProps> = ({
  anomaly,
  readings,
  onClose,
  onUpdateStatus,
  tariffRate,
  buildings,
}) => {
  if (!anomaly) return null;

  const [selectedStatus, setSelectedStatus] = useState<DetectedAnomaly['status']>(anomaly.status);
  const [actionNotes, setActionNotes] = useState(anomaly.logged_action_notes || '');
  const [verifiedKwhInput, setVerifiedKwhInput] = useState(
    anomaly.verified_savings_kwh ? anomaly.verified_savings_kwh.toString() : ''
  );
  const [isSaved, setIsSaved] = useState(false);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const exp = anomaly.explanation;
  const excessCost = Math.round(exp.excess_kwh * tariffRate * 100) / 100;
  const diffKwh = anomaly.consumption_kwh - exp.baseline_median_kwh;
  const diffPct =
    exp.baseline_median_kwh > 0
      ? ((anomaly.consumption_kwh - exp.baseline_median_kwh) / exp.baseline_median_kwh) * 100
      : 0;
  const buildingAlias = getBuildingDisplayName(anomaly.building_id, buildings);
  const plainEnglishFinding = formatAnomalyPlainEnglish(anomaly);
  const headline = getAnomalyHeadline(anomaly);

  // Extract surrounding context readings for this facility to show actual vs expected baseline
  const timelinePoints = useMemo(() => {
    if (!readings || readings.length === 0) {
      // Fallback synthetic window if no raw readings array provided
      return [
        {
          timestamp: new Date(new Date(anomaly.timestamp).getTime() - 2 * 3600000).toISOString(),
          consumptionKwh: exp.baseline_median_kwh * 0.98,
          isAnomaly: false,
        },
        {
          timestamp: new Date(new Date(anomaly.timestamp).getTime() - 3600000).toISOString(),
          consumptionKwh: exp.baseline_median_kwh * 1.02,
          isAnomaly: false,
        },
        {
          timestamp: anomaly.timestamp,
          consumptionKwh: anomaly.consumption_kwh,
          isAnomaly: true,
        },
        {
          timestamp: new Date(new Date(anomaly.timestamp).getTime() + 3600000).toISOString(),
          consumptionKwh: exp.baseline_median_kwh * 1.05,
          isAnomaly: false,
        },
        {
          timestamp: new Date(new Date(anomaly.timestamp).getTime() + 2 * 3600000).toISOString(),
          consumptionKwh: exp.baseline_median_kwh * 0.99,
          isAnomaly: false,
        },
      ];
    }

    const bldReadings = readings
      .filter((r) => r.building_id === anomaly.building_id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (bldReadings.length === 0) return [];

    const anomTime = new Date(anomaly.timestamp).getTime();
    // 24-hour centered window (+/- 12 hours)
    const windowMs = 12 * 3600 * 1000;
    let window = bldReadings.filter((r) => {
      const t = new Date(r.timestamp).getTime();
      return t >= anomTime - windowMs && t <= anomTime + windowMs;
    });

    if (window.length < 5) {
      const idx = bldReadings.findIndex((r) => r.timestamp === anomaly.timestamp);
      if (idx !== -1) {
        const start = Math.max(0, idx - 12);
        const end = Math.min(bldReadings.length, idx + 13);
        window = bldReadings.slice(start, end);
      } else {
        window = bldReadings.slice(0, 24);
      }
    }

    return window.map((r) => ({
      timestamp: r.timestamp,
      consumptionKwh: r.consumption_kwh,
      isAnomaly: r.timestamp === anomaly.timestamp,
    }));
  }, [readings, anomaly.building_id, anomaly.timestamp, exp.baseline_median_kwh]);

  // SVG Chart Geometry Calculations
  const chartGeometry = useMemo(() => {
    if (timelinePoints.length === 0) return null;

    const width = 560;
    const height = 180;
    const paddingLeft = 52;
    const paddingRight = 24;
    const paddingTop = 24;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const allValues = timelinePoints.map((p) => p.consumptionKwh);
    allValues.push(exp.baseline_median_kwh);
    allValues.push(anomaly.consumption_kwh);

    const minVal = Math.max(0, Math.min(...allValues) * 0.85);
    const maxVal = Math.max(...allValues) * 1.15;
    const valRange = maxVal - minVal || 1;

    const scaleX = (idx: number) => {
      if (timelinePoints.length <= 1) return paddingLeft + plotWidth / 2;
      return paddingLeft + (idx / (timelinePoints.length - 1)) * plotWidth;
    };

    const scaleY = (val: number) => {
      return paddingTop + plotHeight - ((val - minVal) / valRange) * plotHeight;
    };

    const points = timelinePoints.map((p, idx) => ({
      ...p,
      x: scaleX(idx),
      y: scaleY(p.consumptionKwh),
    }));

    // SVG path string for actual consumption
    const pathD = points.reduce((acc, pt, idx) => {
      return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    // Area path string
    const areaD = `${pathD} L ${scaleX(timelinePoints.length - 1)} ${scaleY(minVal)} L ${scaleX(0)} ${scaleY(minVal)} Z`;

    const baselineY = scaleY(exp.baseline_median_kwh);
    const anomalyPoint = points.find((p) => p.isAnomaly) || points[Math.floor(points.length / 2)];

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth,
      plotHeight,
      minVal,
      maxVal,
      points,
      pathD,
      areaD,
      baselineY,
      anomalyPoint,
    };
  }, [timelinePoints, exp.baseline_median_kwh, anomaly.consumption_kwh]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const verifiedKwh = verifiedKwhInput ? parseFloat(verifiedKwhInput) : undefined;
    onUpdateStatus(anomaly.anomaly_id, selectedStatus, actionNotes, verifiedKwh);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-6 relative max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  anomaly.severity === 'critical'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : anomaly.severity === 'high'
                    ? 'bg-orange-100 text-orange-800 border border-orange-200'
                    : anomaly.severity === 'medium'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {anomaly.severity} Severity Alert
              </span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                {anomaly.anomaly_id}
              </span>
            </div>

            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {headline}
            </h2>

            {/* Consistent Building Alias + Internal ID */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-0.5">
              <span className="inline-flex items-center gap-1 font-bold text-slate-900">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                {buildingAlias}
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                ({anomaly.building_id})
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {new Date(anomaly.timestamp).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plain English Operational Finding (Clear & Non-Technical) */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Plain English Operational Summary
          </div>
          <p className="text-sm font-medium text-amber-950 leading-relaxed font-sans">
            {plainEnglishFinding}
          </p>
        </div>

        {/* Statistical Evidence Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Observed</span>
            <p className="text-base font-bold font-mono text-blue-700">
              {anomaly.consumption_kwh.toFixed(1)} <span className="text-xs font-normal">kWh</span>
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Baseline</span>
            <p className="text-base font-bold font-mono text-slate-700">
              {exp.baseline_median_kwh.toFixed(1)} <span className="text-xs font-normal">kWh</span>
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Net Difference</span>
            <p className={`text-base font-bold font-mono ${diffKwh > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
              {formatSignedKwhDiff(diffKwh)}
            </p>
            <span className="text-[10px] font-semibold text-slate-500 font-mono">
              ({formatSignedPercentage(diffPct)})
            </span>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Deviation Factor</span>
            <p className={`text-base font-bold font-mono ${exp.robust_z_score > 0 ? 'text-red-600' : 'text-slate-700'}`}>
              {formatSignedMadScore(exp.robust_z_score)}
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase">Cost Exposure</span>
            <p className="text-base font-bold font-mono text-amber-700">
              ${excessCost.toFixed(2)}
            </p>
            <span className="text-[10px] text-slate-500 block">
              {exp.excess_kwh > 0 ? `${exp.excess_kwh.toFixed(1)} kWh excess` : 'No excess'}
            </span>
          </div>
        </div>

        {/* Investigation Line Chart: Actual Consumption vs Expected Baseline */}
        {chartGeometry && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wide">
                <LineChart className="w-4 h-4 text-blue-700" />
                Contextual Load Profile: Actual vs. Expected Baseline
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Facility: {buildingAlias}
              </span>
            </div>

            {/* SVG Chart Container */}
            <div className="relative bg-white rounded-lg border border-slate-200/90 p-2 overflow-hidden shadow-2xs">
              <svg
                viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                className="w-full h-44 sm:h-48 overflow-visible touch-none cursor-crosshair"
                onMouseLeave={() => setHoveredPointIndex(null)}
                onTouchEnd={() => setHoveredPointIndex(null)}
                onTouchMove={(e) => {
                  if (e.touches && e.touches.length > 0) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = (e.touches[0].clientX - rect.left) / rect.width;
                    const closestIdx = Math.min(
                      chartGeometry.points.length - 1,
                      Math.max(0, Math.round(relX * (chartGeometry.points.length - 1)))
                    );
                    setHoveredPointIndex(closestIdx);
                  }
                }}
              >
                <defs>
                  <linearGradient id="modalLoadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Guide Lines */}
                <line
                  x1={chartGeometry.paddingLeft}
                  y1={chartGeometry.paddingTop}
                  x2={chartGeometry.width - chartGeometry.paddingRight}
                  y2={chartGeometry.paddingTop}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <line
                  x1={chartGeometry.paddingLeft}
                  y1={chartGeometry.height - chartGeometry.paddingBottom}
                  x2={chartGeometry.width - chartGeometry.paddingRight}
                  y2={chartGeometry.height - chartGeometry.paddingBottom}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />

                {/* Y-axis Ticks & Labels */}
                <text
                  x={chartGeometry.paddingLeft - 8}
                  y={chartGeometry.paddingTop + 4}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {Math.round(chartGeometry.maxVal)} kWh
                </text>
                <text
                  x={chartGeometry.paddingLeft - 8}
                  y={chartGeometry.height - chartGeometry.paddingBottom + 3}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {Math.round(chartGeometry.minVal)} kWh
                </text>

                {/* Expected Baseline Line (Dashed) */}
                <line
                  x1={chartGeometry.paddingLeft}
                  y1={chartGeometry.baselineY}
                  x2={chartGeometry.width - chartGeometry.paddingRight}
                  y2={chartGeometry.baselineY}
                  stroke="#64748b"
                  strokeWidth="1.75"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartGeometry.width - chartGeometry.paddingRight - 4}
                  y={chartGeometry.baselineY - 5}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-slate-600 font-semibold"
                >
                  Baseline {exp.baseline_median_kwh.toFixed(1)} kWh
                </text>

                {/* Actual Consumption Area Fill */}
                <path d={chartGeometry.areaD} fill="url(#modalLoadGrad)" />

                {/* Actual Consumption Stroke Line */}
                <path
                  d={chartGeometry.pathD}
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Hover Scrubber Guideline */}
                {hoveredPointIndex !== null && chartGeometry.points[hoveredPointIndex] && (
                  <g>
                    <line
                      x1={chartGeometry.points[hoveredPointIndex].x}
                      y1={chartGeometry.paddingTop}
                      x2={chartGeometry.points[hoveredPointIndex].x}
                      y2={chartGeometry.height - chartGeometry.paddingBottom}
                      stroke="#475569"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  </g>
                )}

                {/* Regular Reading Data Points */}
                {chartGeometry.points.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPointIndex === idx ? 5 : 3}
                    className={`transition-all cursor-pointer ${
                      pt.isAnomaly
                        ? 'fill-red-600 stroke-white stroke-2'
                        : hoveredPointIndex === idx
                        ? 'fill-blue-700 stroke-white stroke-2'
                        : 'fill-blue-600'
                    }`}
                    onMouseEnter={() => setHoveredPointIndex(idx)}
                    onClick={() => setHoveredPointIndex(idx)}
                  />
                ))}

                {/* Target Flagged Anomaly Highlight Callout */}
                {chartGeometry.anomalyPoint && (
                  <g>
                    {/* Pulsing Outer Ring */}
                    <circle
                      cx={chartGeometry.anomalyPoint.x}
                      cy={chartGeometry.anomalyPoint.y}
                      r="9"
                      fill="none"
                      stroke={anomaly.severity === 'critical' ? '#dc2626' : anomaly.severity === 'high' ? '#f97316' : '#2563eb'}
                      strokeWidth="2"
                      opacity="0.85"
                    />
                    <circle
                      cx={chartGeometry.anomalyPoint.x}
                      cy={chartGeometry.anomalyPoint.y}
                      r="4.5"
                      fill={anomaly.severity === 'critical' ? '#dc2626' : anomaly.severity === 'high' ? '#f97316' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />

                    {/* Flagged Point Badge */}
                    <g
                      transform={`translate(${Math.max(
                        chartGeometry.paddingLeft,
                        Math.min(chartGeometry.width - chartGeometry.paddingRight - 110, chartGeometry.anomalyPoint.x - 55)
                      )}, ${Math.max(8, chartGeometry.anomalyPoint.y - 28)})`}
                    >
                      <rect
                        width="110"
                        height="20"
                        rx="4"
                        fill="#0f172a"
                        opacity="0.92"
                      />
                      <text
                        x="55"
                        y="14"
                        textAnchor="middle"
                        fill="#ffffff"
                        className="text-[10px] font-mono font-bold"
                      >
                        {anomaly.consumption_kwh.toFixed(1)} kWh ({diffPct > 0 ? '+' : ''}{diffPct.toFixed(0)}%)
                      </text>
                    </g>
                  </g>
                )}

                {/* X-axis start and end time labels */}
                {chartGeometry.points.length > 0 && (
                  <>
                    <text
                      x={chartGeometry.paddingLeft}
                      y={chartGeometry.height - 8}
                      textAnchor="start"
                      className="text-[9px] fill-slate-400 font-mono"
                    >
                      {new Date(chartGeometry.points[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </text>
                    <text
                      x={chartGeometry.width - chartGeometry.paddingRight}
                      y={chartGeometry.height - 8}
                      textAnchor="end"
                      className="text-[9px] fill-slate-400 font-mono"
                    >
                      {new Date(chartGeometry.points[chartGeometry.points.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </text>
                  </>
                )}
              </svg>

              {/* Interactive Tooltip when scrubbing points */}
              {hoveredPointIndex !== null && chartGeometry.points[hoveredPointIndex] && (
                (() => {
                  const pt = chartGeometry.points[hoveredPointIndex];
                  const diff = pt.consumptionKwh - exp.baseline_median_kwh;
                  return (
                    <div className="absolute top-2 left-14 bg-slate-900/95 text-white rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none flex items-center gap-2 border border-slate-700 backdrop-blur-xs">
                      <span className="font-mono text-slate-300">
                        {new Date(pt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>|</span>
                      <span className="font-mono font-bold text-blue-300">
                        {pt.consumptionKwh.toFixed(1)} kWh
                      </span>
                      <span className={`font-mono text-[10px] ${diff >= 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                        ({diff >= 0 ? '+' : ''}{diff.toFixed(1)} vs baseline)
                      </span>
                      {pt.isAnomaly && (
                        <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                          Flagged
                        </span>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Legend & Context Explainer */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 pt-1">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-1 bg-blue-700 rounded-full inline-block" />
                  <span className="font-semibold text-slate-800">Actual Monitored Load</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-t border-dashed border-slate-600 inline-block" />
                  <span className="font-semibold text-slate-800">Expected Baseline Median</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 ring-2 ring-red-200 inline-block" />
                  <span className="font-semibold text-red-700">Flagged Anomaly Event</span>
                </span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">
                {timelinePoints.length} context intervals plotted
              </span>
            </div>
          </div>
        )}

        {/* Explanation & Reason Narrative */}
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-wide">
            <Info className="w-4 h-4 text-blue-600" />
            Mathematical Audit Reason
          </div>
          <p className="text-sm text-blue-950 leading-relaxed font-sans">
            {exp.reason}
          </p>
          <div className="text-[11px] text-blue-700 pt-1 border-t border-blue-200/50 flex flex-wrap gap-x-4">
            <span>Historical bin samples: <strong>{exp.bin_sample_count}</strong></span>
            <span>MAD threshold: <strong>{exp.mad_kwh.toFixed(1)} kWh</strong></span>
            <span>Upper bound limit: <strong>{exp.threshold_upper_kwh.toFixed(1)} kWh</strong></span>
          </div>
        </div>

        {/* Suggested Investigation SOP */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
            <Compass className="w-4 h-4 text-emerald-600" />
            Investigative Hypothesis & Action Checklist
          </div>
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-sm text-slate-700 space-y-2">
            <p className="font-medium text-emerald-950">
              {exp.investigation_hypothesis}
            </p>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li>Verify facility automation schedule (BAS) overrides for fans, pumps, or chiller stage-up.</li>
              <li>Confirm whether scheduled occupancy or special campus events took place at this timestamp.</li>
              <li>Inspect submeter physical connections to rule out telemetry signal corruption.</li>
            </ul>
          </div>
        </div>

        {/* Action Triage Form */}
        <form onSubmit={handleSave} className="space-y-4 pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Investigation Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as DetectedAnomaly['status'])}
                className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="flagged">Flagged (Needs Review)</option>
                <option value="investigating">Under Investigation</option>
                <option value="action_taken">Maintenance Action Taken</option>
                <option value="resolved">Resolved (Confirmed Fixed)</option>
                <option value="dismissed">Dismissed (Legitimate Event)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Verified Measured Reduction (kWh)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={verifiedKwhInput}
                onChange={(e) => setVerifiedKwhInput(e.target.value)}
                placeholder="e.g. 75.0 (only if verified)"
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <span className="text-[10px] text-slate-400">
                Logs to Verified Savings ledger only when documented by subsequent readings.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Field Inspection & Maintenance Notes
            </label>
            <textarea
              rows={2}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Record physical findings: e.g. Chiller override reset to schedule; maintenance ticket #419 logged."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 italic">
              EnerSight AI preserves strict distinction between estimated exposure and verified savings.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 text-white ${
                  isSaved ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Updated!
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5" />
                    Save Audit Record
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
