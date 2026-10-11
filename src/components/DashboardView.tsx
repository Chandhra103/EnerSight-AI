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
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Filter,
  HelpCircle,
  Info,
  Layers,
  PieChart,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { BuildingMetadata, DatasetBundle, DetectedAnomaly, EnergyReading } from '../types/energy.ts';
import { TimeSeriesChart } from './TimeSeriesChart.tsx';
import { formatSignedMadScore, getBuildingDisplayName } from '../utils/buildingUtils.ts';

interface DashboardViewProps {
  dataset: DatasetBundle;
  anomalies: DetectedAnomaly[];
  tariffRate: number;
  onSelectAnomaly: (anomaly: DetectedAnomaly) => void;
  onNavigateTab: (tab: 'buildings' | 'anomalies' | 'impact', filter?: string) => void;
  selectedBuildingId?: string;
  onSelectBuildingId?: (buildingId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  anomalies,
  tariffRate,
  onSelectAnomaly,
  onNavigateTab,
  selectedBuildingId: controlledBuildingId,
  onSelectBuildingId,
}) => {
  const [internalBuildingId, setInternalBuildingId] = useState<string>('ALL');
  const selectedBuildingId =
    controlledBuildingId !== undefined ? controlledBuildingId : internalBuildingId;
  const setSelectedBuildingId = (id: string) => {
    setInternalBuildingId(id);
    onSelectBuildingId?.(id);
  };

  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  // Filtered readings
  const filteredReadings = useMemo(() => {
    if (selectedBuildingId === 'ALL') return dataset.readings;
    return dataset.readings.filter((r) => r.building_id === selectedBuildingId);
  }, [dataset.readings, selectedBuildingId]);

  // Total consumption
  const totalConsumptionKwh = useMemo(() => {
    return filteredReadings.reduce((acc, r) => acc + r.consumption_kwh, 0);
  }, [filteredReadings]);

  // Estimated Cost
  const estimatedCostUsd = useMemo(() => {
    return totalConsumptionKwh * tariffRate;
  }, [totalConsumptionKwh, tariffRate]);

  // Filtered anomalies
  const filteredAnomalies = useMemo(() => {
    if (selectedBuildingId === 'ALL') return anomalies;
    return anomalies.filter((a) => a.building_id === selectedBuildingId);
  }, [anomalies, selectedBuildingId]);

  // Estimated Potential Savings (Excess kWh exposure)
  const potentialExcessKwh = useMemo(() => {
    return filteredAnomalies.reduce((acc, a) => acc + (a.explanation.excess_kwh || 0), 0);
  }, [filteredAnomalies]);

  const potentialSavingsUsd = useMemo(() => {
    return potentialExcessKwh * tariffRate;
  }, [potentialExcessKwh, tariffRate]);

  // Verified Savings
  const verifiedSavingsKwh = useMemo(() => {
    return filteredAnomalies.reduce((acc, a) => acc + (a.verified_savings_kwh || 0), 0);
  }, [filteredAnomalies]);

  const verifiedSavingsUsd = useMemo(() => {
    return verifiedSavingsKwh * tariffRate;
  }, [verifiedSavingsKwh, tariffRate]);

  // Severity counts
  const criticalCount = filteredAnomalies.filter((a) => a.severity === 'critical').length;
  const highCount = filteredAnomalies.filter((a) => a.severity === 'high').length;
  const mediumCount = filteredAnomalies.filter((a) => a.severity === 'medium').length;
  const lowCount = filteredAnomalies.filter((a) => a.severity === 'low').length;

  // --------------------------------------------------------------------------
  // CHART DATA 1: 24-Hour Diurnal Load Profile
  // --------------------------------------------------------------------------
  const hourlyProfile = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      totalKwh: 0,
      count: 0,
      anomaliesCount: 0,
    }));

    for (const r of filteredReadings) {
      const d = new Date(r.timestamp);
      const h = d.getHours();
      if (h >= 0 && h < 24) {
        hours[h].totalKwh += r.consumption_kwh;
        hours[h].count += 1;
      }
    }

    for (const a of filteredAnomalies) {
      const d = new Date(a.timestamp);
      const h = d.getHours();
      if (h >= 0 && h < 24) {
        hours[h].anomaliesCount += 1;
      }
    }

    return hours.map((h) => ({
      hour: h.hour,
      avgKwh: h.count > 0 ? h.totalKwh / h.count : 0,
      count: h.count,
      anomaliesCount: h.anomaliesCount,
    }));
  }, [filteredReadings, filteredAnomalies]);

  const maxHourlyAvg = useMemo(() => {
    const max = Math.max(...hourlyProfile.map((h) => h.avgKwh), 1);
    return max;
  }, [hourlyProfile]);

  const peakHour = useMemo(() => {
    return hourlyProfile.reduce(
      (max, h) => (h.avgKwh > max.avgKwh ? h : max),
      hourlyProfile[0] || { hour: 0, avgKwh: 0, count: 0, anomaliesCount: 0 }
    );
  }, [hourlyProfile]);

  const minBaseloadHour = useMemo(() => {
    const valid = hourlyProfile.filter((h) => h.avgKwh > 0);
    if (valid.length === 0) return { hour: 0, avgKwh: 0, count: 0, anomaliesCount: 0 };
    return valid.reduce((min, h) => (h.avgKwh < min.avgKwh ? h : min), valid[0]);
  }, [hourlyProfile]);

  // --------------------------------------------------------------------------
  // CHART DATA 2: Day-of-Week Operational Profile (Mon - Sun)
  // --------------------------------------------------------------------------
  const dayOfWeekProfile = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Sequence Mon (1) to Sun (0)
    const days = [1, 2, 3, 4, 5, 6, 0].map((dayIndex) => ({
      dayIndex,
      name: dayNames[dayIndex],
      isWeekend: dayIndex === 0 || dayIndex === 6,
      totalKwh: 0,
      count: 0,
    }));

    for (const r of filteredReadings) {
      const d = new Date(r.timestamp);
      const day = d.getDay();
      const target = days.find((item) => item.dayIndex === day);
      if (target) {
        target.totalKwh += r.consumption_kwh;
        target.count += 1;
      }
    }

    return days.map((d) => ({
      ...d,
      avgKwh: d.count > 0 ? d.totalKwh / d.count : 0,
    }));
  }, [filteredReadings]);

  const maxDayAvg = useMemo(() => {
    return Math.max(...dayOfWeekProfile.map((d) => d.avgKwh), 1);
  }, [dayOfWeekProfile]);

  const weekdayVsWeekend = useMemo(() => {
    const weekdays = dayOfWeekProfile.filter((d) => !d.isWeekend);
    const weekends = dayOfWeekProfile.filter((d) => d.isWeekend);

    const weekdayAvg =
      weekdays.length > 0 ? weekdays.reduce((a, b) => a + b.avgKwh, 0) / weekdays.length : 0;
    const weekendAvg =
      weekends.length > 0 ? weekends.reduce((a, b) => a + b.avgKwh, 0) / weekends.length : 0;
    const dropPct = weekdayAvg > 0 ? ((weekdayAvg - weekendAvg) / weekdayAvg) * 100 : 0;

    return { weekdayAvg, weekendAvg, dropPct };
  }, [dayOfWeekProfile]);

  // --------------------------------------------------------------------------
  // CHART DATA 3: Facility / Operational Distribution (Donut Chart)
  // --------------------------------------------------------------------------
  const distributionData = useMemo(() => {
    if (selectedBuildingId === 'ALL') {
      const palette = ['#1d4ed8', '#059669', '#0891b2', '#6366f1', '#d97706'];
      return dataset.buildings.map((b, idx) => {
        const bReadings = dataset.readings.filter((r) => r.building_id === b.building_id);
        const kwh = bReadings.reduce((sum, r) => sum + r.consumption_kwh, 0);
        const pct = totalConsumptionKwh > 0 ? (kwh / totalConsumptionKwh) * 100 : 0;
        return {
          id: b.building_id,
          label: b.display_name,
          sublabel: b.primary_use,
          kwh,
          pct,
          color: palette[idx % palette.length],
        };
      });
    } else {
      let daytimeKwh = 0;
      let nighttimeKwh = 0;
      let weekendKwh = 0;

      for (const r of filteredReadings) {
        const d = new Date(r.timestamp);
        const day = d.getDay();
        const hour = d.getHours();
        if (day === 0 || day === 6) {
          weekendKwh += r.consumption_kwh;
        } else if (hour >= 8 && hour < 18) {
          daytimeKwh += r.consumption_kwh;
        } else {
          nighttimeKwh += r.consumption_kwh;
        }
      }

      const total = daytimeKwh + nighttimeKwh + weekendKwh;
      return [
        {
          id: 'daytime',
          label: 'Business Hours (08:00 - 18:00)',
          sublabel: 'Weekday active operations',
          kwh: daytimeKwh,
          pct: total > 0 ? (daytimeKwh / total) * 100 : 0,
          color: '#1d4ed8',
        },
        {
          id: 'nighttime',
          label: 'After-Hours (18:00 - 08:00)',
          sublabel: 'Weekday overnight baseload',
          kwh: nighttimeKwh,
          pct: total > 0 ? (nighttimeKwh / total) * 100 : 0,
          color: '#059669',
        },
        {
          id: 'weekend',
          label: 'Weekend Operations',
          sublabel: 'Saturday & Sunday low occupancy',
          kwh: weekendKwh,
          pct: total > 0 ? (weekendKwh / total) * 100 : 0,
          color: '#0891b2',
        },
      ];
    }
  }, [selectedBuildingId, dataset.buildings, dataset.readings, filteredReadings, totalConsumptionKwh]);

  // Donut SVG circumference and segment offsets
  const donutRadius = 56;
  const donutCircumference = 2 * Math.PI * donutRadius; // ~351.86
  const donutSegments = useMemo(() => {
    let accumulatedOffset = 0;
    return distributionData.map((item) => {
      const segmentLength = (item.pct / 100) * donutCircumference;
      const offset = accumulatedOffset;
      accumulatedOffset += segmentLength;
      return {
        ...item,
        dashArray: `${segmentLength.toFixed(2)} ${(donutCircumference - segmentLength).toFixed(2)}`,
        dashOffset: (-offset).toFixed(2),
      };
    });
  }, [distributionData, donutCircumference]);

  // --------------------------------------------------------------------------
  // CHART DATA 4: Anomaly Severity & Cost Exposure Breakdown
  // --------------------------------------------------------------------------
  const severityBreakdown = useMemo(() => {
    const tiers: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      label: string;
      range: string;
      color: string;
      bgColor: string;
      badgeColor: string;
      count: number;
      excessKwh: number;
    }> = [
      {
        severity: 'critical',
        label: 'Critical Anomaly',
        range: '> 6.0 MAD factor',
        color: '#dc2626',
        bgColor: 'bg-red-600',
        badgeColor: 'bg-red-100 text-red-800 border-red-200',
        count: criticalCount,
        excessKwh: filteredAnomalies
          .filter((a) => a.severity === 'critical')
          .reduce((s, a) => s + (a.explanation.excess_kwh || 0), 0),
      },
      {
        severity: 'high',
        label: 'High Anomaly',
        range: '4.5 - 6.0 MAD factor',
        color: '#ea580c',
        bgColor: 'bg-orange-500',
        badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
        count: highCount,
        excessKwh: filteredAnomalies
          .filter((a) => a.severity === 'high')
          .reduce((s, a) => s + (a.explanation.excess_kwh || 0), 0),
      },
      {
        severity: 'medium',
        label: 'Medium Anomaly',
        range: '3.5 - 4.5 MAD factor',
        color: '#2563eb',
        bgColor: 'bg-blue-600',
        badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
        count: mediumCount,
        excessKwh: filteredAnomalies
          .filter((a) => a.severity === 'medium')
          .reduce((s, a) => s + (a.explanation.excess_kwh || 0), 0),
      },
      {
        severity: 'low',
        label: 'Low Anomaly',
        range: '3.0 - 3.5 MAD factor',
        color: '#64748b',
        bgColor: 'bg-slate-500',
        badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
        count: lowCount,
        excessKwh: filteredAnomalies
          .filter((a) => a.severity === 'low')
          .reduce((s, a) => s + (a.explanation.excess_kwh || 0), 0),
      },
    ];

    const maxCount = Math.max(...tiers.map((t) => t.count), 1);

    return tiers.map((t) => ({
      ...t,
      costExposure: t.excessKwh * tariffRate,
      percentage: filteredAnomalies.length > 0 ? (t.count / filteredAnomalies.length) * 100 : 0,
      barWidthPct: Math.min(100, Math.max(3, Math.round((t.count / maxCount) * 100))),
    }));
  }, [filteredAnomalies, criticalCount, highCount, mediumCount, lowCount, tariffRate]);

  return (
    <div className="space-y-6">
      {/* Portfolio Filter & Status Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-700" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Facility Portfolio Filter</h2>
            <p className="text-[11px] text-slate-500">
              Select an individual building or view aggregate portfolio analytics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedBuildingId}
            onChange={(e) => setSelectedBuildingId(e.target.value)}
            className="w-full sm:w-64 text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-slate-50 hover:bg-white transition-colors cursor-pointer"
          >
            <option value="ALL">All Facilities ({dataset.buildings.length} Buildings)</option>
            {dataset.buildings.map((b) => (
              <option key={b.building_id} value={b.building_id}>
                {b.display_name} ({b.primary_use})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Executive KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Consumption */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Consumption
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              {Math.round(totalConsumptionKwh).toLocaleString()}{' '}
              <span className="text-sm font-semibold text-slate-500">kWh</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              From {filteredReadings.length.toLocaleString()} interval readings
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Portfolio Scope:</span>
            <span className="font-semibold text-slate-800">
              {selectedBuildingId === 'ALL' ? `${dataset.buildings.length} Buildings` : '1 Building'}
            </span>
          </div>
        </div>

        {/* KPI 2: Estimated Energy Cost */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Estimated Energy Cost
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              ${Math.round(estimatedCostUsd).toLocaleString()}{' '}
              <span className="text-sm font-normal text-slate-400">USD</span>
            </div>
            <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
              <span>Based on transparent rate: <strong>${tariffRate.toFixed(2)}/kWh</strong></span>
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Model Type:</span>
            <span className="font-semibold text-slate-800">Flat Blended Tariff</span>
          </div>
        </div>

        {/* KPI 3: Flagged Anomalies */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Flagged Anomalies
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight flex items-baseline gap-2">
              <span>{filteredAnomalies.length}</span>
              <span className="text-xs font-normal text-slate-400">
                ({((filteredAnomalies.length / Math.max(1, filteredReadings.length)) * 100).toFixed(1)}% rate)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap">
              <span className="text-red-700 font-semibold">{criticalCount} Critical</span>
              <span className="text-slate-300">•</span>
              <span className="text-orange-700 font-semibold">{highCount} High</span>
              <span className="text-slate-300">•</span>
              <span className="text-blue-700 font-semibold">{mediumCount} Med</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-600 font-semibold">{lowCount} Low</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => onNavigateTab('anomalies')}
              className="text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              Inspect All Anomalies <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 4: Estimated Potential Savings */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Estimated Potential Savings
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-indigo-900 font-mono tracking-tight">
              ${potentialSavingsUsd.toFixed(2)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Excess: {Math.round(potentialExcessKwh).toLocaleString()} kWh above threshold
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Verified Savings:</span>
            <span className="font-bold text-emerald-700">
              ${verifiedSavingsUsd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Time Series Chart */}
      <TimeSeriesChart
        readings={filteredReadings}
        anomalies={filteredAnomalies}
        selectedBuildingId={selectedBuildingId}
        buildings={dataset.buildings}
        onSelectAnomaly={onSelectAnomaly}
      />

      {/* Multi-Dimensional Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: Energy Consumption Distribution (Donut Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <PieChart className="w-4 h-4 text-blue-700" />
                Energy Consumption Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedBuildingId === 'ALL'
                  ? 'Portfolio load share proportion across monitored facilities'
                  : 'Operational load share: daytime vs after-hours baseload'}
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              {distributionData.length} Segments
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* SVG Donut */}
            <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 160 160" className="w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r={donutRadius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="20"
                />
                {donutSegments.map((segment) => {
                  const isHovered = hoveredSegmentId === segment.id;
                  return (
                    <circle
                      key={segment.id}
                      cx="80"
                      cy="80"
                      r={donutRadius}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth={isHovered ? 24 : 20}
                      strokeDasharray={segment.dashArray}
                      strokeDashoffset={segment.dashOffset}
                      strokeLinecap="butt"
                      className="transition-all duration-200 cursor-pointer hover:opacity-90"
                      onMouseEnter={() => setHoveredSegmentId(segment.id)}
                      onMouseLeave={() => setHoveredSegmentId(null)}
                      onClick={() => {
                        if (selectedBuildingId === 'ALL') {
                          setSelectedBuildingId(segment.id);
                        } else {
                          setSelectedBuildingId('ALL');
                        }
                      }}
                    />
                  );
                })}
              </svg>

              {/* Donut Center Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                {hoveredSegmentId ? (
                  (() => {
                    const activeSeg = distributionData.find((d) => d.id === hoveredSegmentId);
                    if (!activeSeg) return null;
                    return (
                      <>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[120px]">
                          {activeSeg.label}
                        </span>
                        <span className="text-sm font-black font-mono text-slate-900 leading-tight">
                          {Math.round(activeSeg.kwh).toLocaleString()} kWh
                        </span>
                        <span className="text-[10px] font-bold font-mono text-blue-700 mt-0.5">
                          {activeSeg.pct.toFixed(1)}% ({((activeSeg.kwh * tariffRate)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })})
                        </span>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Total Energy
                    </span>
                    <span className="text-sm font-black font-mono text-slate-900 leading-tight">
                      {totalConsumptionKwh >= 1000000
                        ? `${(totalConsumptionKwh / 1000000).toFixed(2)} GWh`
                        : totalConsumptionKwh >= 1000
                        ? `${(totalConsumptionKwh / 1000).toFixed(1)} MWh`
                        : `${Math.round(totalConsumptionKwh).toLocaleString()} kWh`}
                    </span>
                    <span className="text-[9px] font-semibold text-slate-500 mt-0.5">
                      {selectedBuildingId === 'ALL' ? '100% Portfolio' : '100% Facility'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Donut Legend */}
            <div className="flex-1 w-full space-y-2">
              {distributionData.map((item) => {
                const isHovered = hoveredSegmentId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs cursor-pointer ${
                      isHovered
                        ? 'border-blue-400 bg-blue-50/80 shadow-2xs'
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                    onMouseEnter={() => setHoveredSegmentId(item.id)}
                    onMouseLeave={() => setHoveredSegmentId(null)}
                    onClick={() => {
                      if (selectedBuildingId === 'ALL') {
                        setSelectedBuildingId(item.id);
                      } else {
                        setSelectedBuildingId('ALL');
                      }
                    }}
                    title={
                      selectedBuildingId === 'ALL'
                        ? `Click to filter dashboard to ${item.label}`
                        : 'Click to return to all facilities'
                    }
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="min-w-0 truncate">
                        <div className="font-semibold text-slate-900 truncate">{item.label}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.sublabel}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-slate-900">
                        {Math.round(item.kwh).toLocaleString()}{' '}
                        <span className="text-[10px] text-slate-500 font-normal">kWh</span>
                      </div>
                      <div className="text-[10px] font-semibold font-mono text-blue-700">
                        {item.pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}

              {selectedBuildingId !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedBuildingId('ALL')}
                  className="w-full text-center py-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors border border-dashed border-blue-200 cursor-pointer"
                >
                  ← Return to Portfolio Overview (All Buildings)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CHART 2: 24-Hour Diurnal Load Profile (Column Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-700" />
                24-Hour Diurnal Load Profile
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mean hourly consumption profile identifying daytime peaks vs overnight baseload
              </p>
            </div>
            <div className="flex items-center gap-1.5 self-start sm:self-auto text-[10px] font-semibold">
              <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md">
                Peak: {String(peakHour.hour).padStart(2, '0')}:00 ({peakHour.avgKwh.toFixed(1)} kWh)
              </span>
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                Base: {String(minBaseloadHour.hour).padStart(2, '0')}:00 ({minBaseloadHour.avgKwh.toFixed(1)} kWh)
              </span>
            </div>
          </div>

          {/* SVG 24-Column Chart */}
          <div className="space-y-2">
            <div className="h-44 w-full relative">
              <svg viewBox="0 0 520 160" className="w-full h-full overflow-visible">
                {/* Horizontal reference grid lines */}
                <line x1="35" y1="20" x2="510" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="75" x2="510" y2="75" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="130" x2="510" y2="130" stroke="#e2e8f0" strokeWidth="1" />

                {/* Y-Axis Labels */}
                <text x="30" y="24" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  {Math.round(maxHourlyAvg)}
                </text>
                <text x="30" y="79" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  {Math.round(maxHourlyAvg / 2)}
                </text>
                <text x="30" y="134" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  0
                </text>

                {/* 24 Columns */}
                {hourlyProfile.map((h, i) => {
                  const colWidth = 14;
                  const gap = 5.5;
                  const x = 40 + i * (colWidth + gap);
                  const barHeight = Math.max(2, (h.avgKwh / maxHourlyAvg) * 110);
                  const y = 130 - barHeight;
                  const isBusinessHour = h.hour >= 8 && h.hour <= 17;
                  const isSelected = selectedHour === h.hour;
                  const isHovered = hoveredHour === h.hour || isSelected;
                  const isPeak = h.hour === peakHour.hour;

                  return (
                    <g
                      key={h.hour}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={() => setHoveredHour(h.hour)}
                      onMouseLeave={() => setHoveredHour(null)}
                      onClick={() => setSelectedHour((prev) => (prev === h.hour ? null : h.hour))}
                      onTouchStart={() => setHoveredHour(h.hour)}
                    >
                      {/* Bar */}
                      <rect
                        x={x}
                        y={y}
                        width={colWidth}
                        height={barHeight}
                        rx="3"
                        fill={
                          isSelected
                            ? '#0f172a'
                            : isHovered
                            ? '#1d4ed8'
                            : isPeak
                            ? '#2563eb'
                            : isBusinessHour
                            ? '#3b82f6'
                            : '#94a3b8'
                        }
                        className="transition-all duration-200"
                      />

                      {/* Anomaly Indicator Flag */}
                      {h.anomaliesCount > 0 && (
                        <circle
                          cx={x + colWidth / 2}
                          cy={Math.max(8, y - 6)}
                          r="3"
                          fill="#ea580c"
                          stroke="#ffffff"
                          strokeWidth="1"
                        />
                      )}

                      {/* X-axis tick labels every 4 hours */}
                      {(h.hour % 4 === 0 || h.hour === 23) && (
                        <text
                          x={x + colWidth / 2}
                          y="146"
                          textAnchor="middle"
                          className="text-[9px] fill-slate-500 font-mono font-medium"
                        >
                          {String(h.hour).padStart(2, '0')}:00
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip on Hover or Selection */}
              {(hoveredHour !== null || selectedHour !== null) && (
                (() => {
                  const displayHour = hoveredHour !== null ? hoveredHour : selectedHour!;
                  const item = hourlyProfile[displayHour];
                  return (
                    <div className="absolute top-2 right-2 bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg pointer-events-none flex items-center gap-2 border border-slate-700">
                      <span className="font-mono font-bold text-blue-300">
                        {String(displayHour).padStart(2, '0')}:00 - {String((displayHour + 1) % 24).padStart(2, '0')}:00
                      </span>
                      <span>|</span>
                      <span className="font-mono font-bold">
                        {item.avgKwh.toFixed(1)} kWh
                      </span>
                      {item.anomaliesCount > 0 && (
                        <span className="text-amber-300 font-bold">
                          ({item.anomaliesCount} anomalies)
                        </span>
                      )}
                    </div>
                  );
                })()
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" />
                  <span>Business Hours (08:00 - 18:00)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" />
                  <span>Overnight / Baseload</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-600 inline-block" />
                  <span>Anomaly Detected</span>
                </span>
              </div>
              <span className="text-slate-400 font-mono text-[10px]">24 Intervals</span>
            </div>
          </div>
        </div>

        {/* CHART 3: Day-of-Week Operational Profile (Bar Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-700" />
                Day-of-Week Consumption Pattern
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Average daily load comparing standard workdays (Mon–Fri) against weekends
              </p>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full self-start sm:self-auto">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Weekend Setback: -{weekdayVsWeekend.dropPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-44 w-full">
              <svg viewBox="0 0 460 160" className="w-full h-full overflow-visible">
                {/* Reference Grid lines */}
                <line x1="35" y1="20" x2="445" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="75" x2="445" y2="75" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="35" y1="130" x2="445" y2="130" stroke="#e2e8f0" strokeWidth="1" />

                <text x="30" y="24" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  {Math.round(maxDayAvg)}
                </text>
                <text x="30" y="79" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  {Math.round(maxDayAvg / 2)}
                </text>
                <text x="30" y="134" textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  0
                </text>

                {/* 7 Daily Bars */}
                {dayOfWeekProfile.map((d, idx) => {
                  const barWidth = 38;
                  const gap = 20;
                  const x = 50 + idx * (barWidth + gap);
                  const barHeight = Math.max(4, (d.avgKwh / maxDayAvg) * 110);
                  const y = 130 - barHeight;
                  const isSelected = selectedDay === idx;
                  const isHovered = hoveredDay === idx || isSelected;

                  return (
                    <g
                      key={d.name}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredDay(idx)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onClick={() => setSelectedDay((prev) => (prev === idx ? null : idx))}
                      onTouchStart={() => setHoveredDay(idx)}
                    >
                      {/* Bar Value on top */}
                      <text
                        x={x + barWidth / 2}
                        y={Math.max(14, y - 6)}
                        textAnchor="middle"
                        className={`text-[10px] font-mono font-bold ${
                          isSelected
                            ? 'fill-slate-900 font-extrabold'
                            : isHovered
                            ? 'fill-slate-900'
                            : d.isWeekend
                            ? 'fill-emerald-800'
                            : 'fill-blue-800'
                        }`}
                      >
                        {Math.round(d.avgKwh)}
                      </text>

                      {/* Bar */}
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="4"
                        fill={
                          isSelected
                            ? '#0f172a'
                            : isHovered
                            ? d.isWeekend
                              ? '#047857'
                              : '#1d4ed8'
                            : d.isWeekend
                            ? '#059669'
                            : '#2563eb'
                        }
                        className="transition-colors duration-200"
                      />

                      {/* Day Label */}
                      <text
                        x={x + barWidth / 2}
                        y="146"
                        textAnchor="middle"
                        className={`text-[11px] font-bold ${
                          d.isWeekend ? 'fill-emerald-700' : 'fill-slate-700'
                        }`}
                      >
                        {d.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block" />
                  <span>Weekdays: <strong>{Math.round(weekdayVsWeekend.weekdayAvg).toLocaleString()} kWh/day</strong></span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
                  <span>Weekends: <strong>{Math.round(weekdayVsWeekend.weekendAvg).toLocaleString()} kWh/day</strong></span>
                </span>
              </div>
              <span className="text-emerald-700 font-semibold font-mono text-[10px]">
                Active Setback
              </span>
            </div>
          </div>
        </div>

        {/* CHART 4: Anomaly Severity & Cost Exposure (Horizontal Bar Chart) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Anomaly Severity & Financial Exposure
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Breakdown of {filteredAnomalies.length} detected events across documented MAD severity tiers
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('anomalies')}
              className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Inspect <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3 pt-1">
            {severityBreakdown.map((tier) => (
              <div
                key={tier.severity}
                onClick={() => onNavigateTab('anomalies', tier.severity)}
                className="group p-2.5 rounded-xl border border-slate-100 hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer space-y-1.5 shadow-2xs hover:shadow-xs"
                title={`Click to filter anomalies triage view by ${tier.label}`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${tier.badgeColor}`}
                    >
                      {tier.label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">({tier.range})</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-bold text-blue-700 opacity-80 group-hover:opacity-100 transition-opacity">
                      Inspect ({tier.count}) &rarr;
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono font-bold text-slate-900">
                      ${tier.costExposure.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Horizontal Bar */}
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${tier.bgColor}`}
                    style={{ width: `${tier.barWidthPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Excess Energy Exposure:</span>
                  <span className="font-mono font-semibold text-slate-600">
                    +{Math.round(tier.excessKwh).toLocaleString()} kWh
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Portfolio Potential Exposure Total:</span>
            <span className="font-black text-slate-900 font-mono">
              ${potentialSavingsUsd.toFixed(2)} USD ({Math.round(potentialExcessKwh).toLocaleString()} kWh)
            </span>
          </div>
        </div>
      </div>

      {/* Synthetic Diagnostic Scenario Spotlight (If synthetic dataset is selected) */}
      {dataset.provenance.is_synthetic && dataset.fault_specifications && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-amber-700" />
            <h3 className="font-bold text-amber-950 text-sm">
              Controlled Synthetic Benchmark Fault Injections
            </h3>
            <span className="text-[10px] font-bold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
              Verification Suite
            </span>
          </div>
          <p className="text-xs text-amber-900/80 leading-relaxed">
            This dataset injects 3 specific, documented operational faults into building{' '}
            <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">SIM_BLDG_01</code>.
            Use the chart markers or anomaly list below to evaluate each fault.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {dataset.fault_specifications.map((f) => (
              <div
                key={f.fault_id}
                className="bg-white/80 backdrop-blur-2xs rounded-xl p-3 border border-amber-200 text-xs space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>{f.name}</span>
                  <span className="font-mono text-amber-700">{f.fault_id}</span>
                </div>
                <p className="text-slate-600 text-[11px] leading-tight">
                  {f.description}
                </p>
                <div className="text-[10px] text-amber-800 font-medium pt-1 border-t border-amber-100">
                  Target: {f.normal_baseline_kwh} kWh baseline &rarr; {f.injected_reading_kwh || 'Drift'} kWh fault
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged Anomalies Quick Inspector Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Recent Flagged Anomalies (Click to Investigate)
            </h3>
            <p className="text-xs text-slate-500">
              Each flagged interval includes historical baseline median, robust MAD factor, and investigative checklist.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('anomalies')}
            className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            View All ({filteredAnomalies.length}) <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {filteredAnomalies.length === 0 ? (
          <div className="text-center py-10 text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              No anomalies flagged for the selected building. Operations are within normal baseline bounds!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Building</th>
                  <th className="py-2.5 px-3">Measured kWh</th>
                  <th className="py-2.5 px-3">Baseline Median</th>
                  <th className="py-2.5 px-3">Robust Deviation</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAnomalies.slice(0, 6).map((a) => (
                  <tr
                    key={a.anomaly_id}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                    onClick={() => onSelectAnomaly(a)}
                  >
                    <td className="py-3 px-3 font-mono text-slate-700">
                      {new Date(a.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 leading-tight">
                        {getBuildingDisplayName(a.building_id, dataset.buildings)}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {a.building_id}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-blue-700">
                      {a.consumption_kwh.toFixed(1)} kWh
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {a.explanation.baseline_median_kwh.toFixed(1)} kWh
                    </td>
                    <td className={`py-3 px-3 font-mono font-bold ${a.explanation.robust_z_score > 0 ? 'text-red-600' : 'text-slate-600'}`}>
                      {formatSignedMadScore(a.explanation.robust_z_score)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
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
                    </td>
                    <td className="py-3 px-3">
                      <span className="capitalize text-slate-600 font-medium">
                        {a.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAnomaly(a);
                        }}
                        className="text-xs font-semibold text-blue-700 group-hover:text-blue-900 group-hover:underline cursor-pointer"
                      >
                        Investigate &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
