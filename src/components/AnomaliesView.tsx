/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  Search,
  Wrench,
} from 'lucide-react';
import { BuildingMetadata, DetectedAnomaly } from '../types/energy.ts';
import {
  formatAnomalyPlainEnglish,
  formatSignedKwhDiff,
  formatSignedMadScore,
  formatSignedPercentage,
  getAnomalyHeadline,
  getBuildingDisplayName,
} from '../utils/buildingUtils.ts';

interface AnomaliesViewProps {
  anomalies: DetectedAnomaly[];
  onSelectAnomaly: (anomaly: DetectedAnomaly) => void;
  tariffRate: number;
  buildings?: BuildingMetadata[];
  selectedSeverityFilter?: string;
  onSelectSeverityFilter?: (severity: string) => void;
  selectedBuildingId?: string;
  onSelectBuildingId?: (buildingId: string) => void;
}

export const AnomaliesView: React.FC<AnomaliesViewProps> = ({
  anomalies,
  onSelectAnomaly,
  tariffRate,
  buildings,
  selectedSeverityFilter,
  onSelectSeverityFilter,
  selectedBuildingId,
  onSelectBuildingId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSeverityFilter, setInternalSeverityFilter] = useState<string>('ALL');
  const severityFilter =
    selectedSeverityFilter !== undefined ? selectedSeverityFilter : internalSeverityFilter;
  const setSeverityFilter = (s: string) => {
    setInternalSeverityFilter(s);
    onSelectSeverityFilter?.(s);
  };

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [internalBuildingFilter, setInternalBuildingFilter] = useState<string>('ALL');
  const buildingFilter =
    selectedBuildingId !== undefined && selectedBuildingId !== 'ALL'
      ? selectedBuildingId
      : internalBuildingFilter;
  const setBuildingFilter = (b: string) => {
    setInternalBuildingFilter(b);
    onSelectBuildingId?.(b);
  };

  // Filtered list with comprehensive matching
  const filtered = useMemo(() => {
    return anomalies.filter((a) => {
      const bName = getBuildingDisplayName(a.building_id, buildings).toLowerCase();
      const bId = a.building_id.toLowerCase();
      const reason = a.explanation.reason.toLowerCase();
      const anomId = a.anomaly_id.toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchSearch =
        q === '' ||
        bName.includes(q) ||
        bId.includes(q) ||
        reason.includes(q) ||
        anomId.includes(q);

      const matchSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      const matchType = typeFilter === 'ALL' || a.anomaly_type === typeFilter;
      const matchBuilding = buildingFilter === 'ALL' || a.building_id === buildingFilter;

      return matchSearch && matchSeverity && matchStatus && matchType && matchBuilding;
    });
  }, [anomalies, searchQuery, severityFilter, statusFilter, typeFilter, buildingFilter, buildings]);

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const highCount = anomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = anomalies.filter((a) => a.severity === 'medium').length;
  const lowCount = anomalies.filter((a) => a.severity === 'low').length;

  // Extract unique building IDs for the building filter
  const uniqueBuildingIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of anomalies) {
      set.add(a.building_id);
    }
    return Array.from(set);
  }, [anomalies]);

  // Horizontal bar chart data for severity breakdown
  const severityBreakdown = useMemo(() => {
    const total = anomalies.length;
    const tiers = [
      {
        key: 'critical',
        label: 'Critical Severity',
        count: criticalCount,
        color: 'bg-red-600',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
        badgeBg: 'bg-red-50',
        description: 'Severe baseload surge or off-hours peak spike (Robust Z ≥ +6.0 MAD)',
      },
      {
        key: 'high',
        label: 'High Severity',
        count: highCount,
        color: 'bg-orange-500',
        textColor: 'text-orange-700',
        borderColor: 'border-orange-200',
        badgeBg: 'bg-orange-50',
        description: 'Significant schedule anomaly or persistent baseload drift (Robust Z ≥ +4.5 MAD)',
      },
      {
        key: 'medium',
        label: 'Medium Severity',
        count: mediumCount,
        color: 'bg-blue-600',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        badgeBg: 'bg-blue-50',
        description: 'Notable elevation exceeding typical operating envelope (Robust Z ≥ +3.0 MAD)',
      },
      {
        key: 'low',
        label: 'Low Severity',
        count: lowCount,
        color: 'bg-slate-400',
        textColor: 'text-slate-600',
        borderColor: 'border-slate-200',
        badgeBg: 'bg-slate-100',
        description: 'Moderate statistical variance or baseline drop below typical off-peak demand',
      },
    ];

    const maxCount = Math.max(...tiers.map((t) => t.count), 1);
    return tiers.map((t) => ({
      ...t,
      pctOfMax: Math.round((t.count / maxCount) * 100),
      pctOfTotal: total > 0 ? ((t.count / total) * 100).toFixed(1) : '0.0',
    }));
  }, [anomalies.length, criticalCount, highCount, mediumCount, lowCount]);

  return (
    <div className="space-y-6">
      {/* Header & Severity Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-600" />
            Explainable Anomaly Triage Station
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Every flagged interval is benchmarked against its contextual historical baseline (Median &amp; Median Absolute Deviation).
            Inspect plain English findings, root-cause hypotheses, and log corrective maintenance actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
            {anomalies.length} Total
          </span>
          <span className="text-xs font-bold text-red-800 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
            {criticalCount} Critical
          </span>
          <span className="text-xs font-bold text-orange-800 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
            {highCount} High
          </span>
          <span className="text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
            {mediumCount} Medium
          </span>
          <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
            {lowCount} Low
          </span>
        </div>
      </div>

      {/* Horizontal Bar Chart: Severity Distribution */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-700" />
              Anomaly Severity Distribution (Horizontal Bar Chart)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strictly calculated from all {anomalies.length} verified anomaly records across the active dataset.
            </p>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Sum of categories:</span>
            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
              {criticalCount + highCount + mediumCount + lowCount} / {anomalies.length}
            </span>
            <span className="text-emerald-700 font-semibold">(100% Accounted)</span>
          </div>
        </div>

        {/* Horizontal Bars */}
        <div className="space-y-3.5 pt-1">
          {severityBreakdown.map((tier) => {
            const isSelected = severityFilter === tier.key;

            return (
              <div
                key={tier.key}
                onClick={() => setSeverityFilter((prev) => (prev === tier.key ? 'ALL' : (tier.key as any)))}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
                    : 'border-slate-150 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
                title={`Click to filter table by ${tier.label}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${tier.color}`} />
                    <span className="font-bold text-slate-900">{tier.label}</span>
                    <span className="text-[11px] text-slate-400 hidden md:inline">
                      — {tier.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-bold text-xs ${tier.textColor}`}>
                      {tier.count} anomalies
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      ({tier.pctOfTotal}%)
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700 underline">
                      {isSelected ? 'Clear Filter' : 'Filter &rarr;'}
                    </span>
                  </div>
                </div>

                {/* Bar Track */}
                <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    className={`h-full ${tier.color} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(3, tier.pctOfMax)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <span>
            Click any bar to instantly filter the triage cards below by that severity level.
          </span>
          {severityFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSeverityFilter('ALL')}
              className="text-blue-700 font-bold hover:underline cursor-pointer"
            >
              Reset to All Severities
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Search */}
        <div className="relative lg:col-span-1 sm:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search facility alias, ID, reason..."
            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Building Filter */}
        <div>
          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
          >
            <option value="ALL">All Facilities</option>
            {uniqueBuildingIds.map((bId) => (
              <option key={bId} value={bId}>
                {getBuildingDisplayName(bId, buildings)}
              </option>
            ))}
          </select>
        </div>

        {/* Severity */}
        <div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Severities</option>
            <option value="critical">Critical Severity</option>
            <option value="high">High Severity</option>
            <option value="medium">Medium Severity</option>
            <option value="low">Low Severity</option>
          </select>
        </div>

        {/* Anomaly Type */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Anomaly Types</option>
            <option value="OFF_HOURS_SURGE">Off-Hours Baseload Surge</option>
            <option value="HIGH_PEAK">High Operating Peak</option>
            <option value="BASELOAD_DRIFT">Baseload Drift</option>
            <option value="UNUSUAL_DROP">Unusual Drop / Outage</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="ALL">All Workflow Statuses</option>
            <option value="flagged">Flagged (Needs Review)</option>
            <option value="investigating">Under Investigation</option>
            <option value="action_taken">Action Taken</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      {/* Anomalies List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs text-slate-500">
          <span>
            Showing <strong>{filtered.length}</strong> of {anomalies.length} detected anomalies
          </span>
          <span>Click any card to open the investigation & resolution modal</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No anomalies match your filter criteria.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((a) => {
              const exp = a.explanation;
              const excessCost = exp.excess_kwh * tariffRate;
              const diffKwh = a.consumption_kwh - exp.baseline_median_kwh;
              const diffPct =
                exp.baseline_median_kwh > 0
                  ? ((a.consumption_kwh - exp.baseline_median_kwh) / exp.baseline_median_kwh) * 100
                  : 0;
              const buildingAlias = getBuildingDisplayName(a.building_id, buildings);
              const plainEnglishText = formatAnomalyPlainEnglish(a);
              const headline = getAnomalyHeadline(a);

              return (
                <div
                  key={a.anomaly_id}
                  onClick={() => onSelectAnomaly(a)}
                  className="py-4 px-3 hover:bg-slate-50/80 rounded-xl transition-colors cursor-pointer space-y-2.5 group"
                >
                  {/* Top Bar: Severity, Facility Alias + ID, Timestamp, Status & Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          a.severity === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : a.severity === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : a.severity === 'medium'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {a.severity}
                      </span>

                      {/* Consistent Building Display Alias */}
                      <span className="font-extrabold text-slate-900 text-sm">
                        {buildingAlias}
                      </span>

                      {/* Retained unique internal ID */}
                      <span className="text-[11px] font-mono text-slate-400">
                        ({a.building_id})
                      </span>

                      <span className="text-slate-300 hidden sm:inline">•</span>

                      <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {new Date(a.timestamp).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="capitalize font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        Status: {a.status.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAnomaly(a);
                        }}
                        className="font-bold text-blue-700 hover:text-blue-900 group-hover:underline cursor-pointer flex items-center gap-1"
                      >
                        Investigate &rarr;
                      </button>
                    </div>
                  </div>

                  {/* Plain English Finding Description */}
                  <div className="text-xs text-slate-700 font-sans leading-relaxed bg-slate-50/80 border border-slate-100 p-2.5 rounded-lg">
                    <strong className="text-slate-900 font-semibold">{headline}: </strong>
                    <span>{plainEnglishText}</span>
                  </div>

                  {/* Transparent Mathematical Evidence Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-slate-100/60 p-2.5 rounded-lg border border-slate-200/60">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Observed:</span>{' '}
                      <strong className="font-mono text-blue-700">{a.consumption_kwh.toFixed(1)} kWh</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Baseline Median:</span>{' '}
                      <span className="font-mono text-slate-700 font-semibold">{exp.baseline_median_kwh.toFixed(1)} kWh</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Difference:</span>{' '}
                      <span className={`font-mono font-semibold ${diffKwh > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
                        {formatSignedKwhDiff(diffKwh)} ({formatSignedPercentage(diffPct)})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Robust Score:</span>{' '}
                      <span className={`font-mono font-bold ${exp.robust_z_score > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatSignedMadScore(exp.robust_z_score)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Cost Exposure:</span>{' '}
                      <span className="font-mono text-amber-700 font-bold">${excessCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
