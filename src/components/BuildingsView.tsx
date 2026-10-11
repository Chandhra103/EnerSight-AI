/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  DollarSign,
  Maximize2,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { BuildingMetadata, DatasetBundle, DetectedAnomaly, EnergyReading } from '../types/energy.ts';

interface BuildingsViewProps {
  dataset: DatasetBundle;
  anomalies: DetectedAnomaly[];
  tariffRate: number;
  onFilterBuilding: (buildingId: string) => void;
  selectedBuildingId?: string;
}

export const BuildingsView: React.FC<BuildingsViewProps> = ({
  dataset,
  anomalies,
  tariffRate,
  onFilterBuilding,
  selectedBuildingId,
}) => {
  const [chartMode, setChartMode] = useState<'consumption' | 'eui'>('consumption');

  // Compute per-building stats
  const buildingStats = useMemo(() => {
    return dataset.buildings.map((b) => {
      const bldReadings = dataset.readings.filter((r) => r.building_id === b.building_id);
      const totalKwh = bldReadings.reduce((sum, r) => sum + r.consumption_kwh, 0);
      const costUsd = totalKwh * tariffRate;
      const bldAnomalies = anomalies.filter((a) => a.building_id === b.building_id);
      const sqft = b.floor_area_sqft || 50000;
      const eui = sqft > 0 ? totalKwh / sqft : 0; // kWh per sq.ft

      return {
        ...b,
        readingCount: bldReadings.length,
        totalKwh,
        costUsd,
        anomalyCount: bldAnomalies.length,
        criticalAnomalies: bldAnomalies.filter((a) => a.severity === 'critical').length,
        eui,
      };
    });
  }, [dataset, anomalies, tariffRate]);

  // Aggregate stats for chart scaling
  const maxKwh = useMemo(() => {
    return Math.max(...buildingStats.map((b) => b.totalKwh), 1);
  }, [buildingStats]);

  const maxEui = useMemo(() => {
    return Math.max(...buildingStats.map((b) => b.eui), 0.1);
  }, [buildingStats]);

  const totalPortfolioKwh = useMemo(() => {
    return buildingStats.reduce((sum, b) => sum + b.totalKwh, 0);
  }, [buildingStats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-700" />
            Facility Portfolio & Energy Use Intensity (EUI)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Comparative efficiency benchmarking across all facilities in the active{' '}
            <strong className="text-slate-700">{dataset.provenance.source_name}</strong> workspace.
          </p>
        </div>

        <div className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
          {buildingStats.length} Monitored Facilities
        </div>
      </div>

      {/* Comparative Consumption Bar Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-700" />
              Comparative Energy Consumption Across Facilities
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Empirical load comparison derived directly from monitored meter readings across all facilities.
            </p>
          </div>

          {/* Toggle Metric Mode */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-semibold">
            <button
              type="button"
              onClick={() => setChartMode('consumption')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMode === 'consumption'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Total Energy (kWh)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('eui')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMode === 'eui'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Intensity (kWh/sqft)
            </button>
          </div>
        </div>

        {/* Bar Chart Visualization */}
        <div className="space-y-4 pt-1">
          {buildingStats.map((b) => {
            const isKwhMode = chartMode === 'consumption';
            const value = isKwhMode ? b.totalKwh : b.eui;
            const maxVal = isKwhMode ? maxKwh : maxEui;
            const pct = Math.min(100, Math.max(4, Math.round((value / maxVal) * 100)));
            const portfolioPct = totalPortfolioKwh > 0 ? ((b.totalKwh / totalPortfolioKwh) * 100).toFixed(1) : '0';
            const isCurrentBuilding = selectedBuildingId === b.building_id;

            return (
              <div
                key={b.building_id}
                onClick={() => onFilterBuilding(b.building_id)}
                className={`group p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isCurrentBuilding
                    ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
                    : 'border-slate-150 hover:border-blue-300 hover:bg-slate-50/70'
                }`}
                title={`Click to filter dashboard to ${b.display_name}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 mb-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {b.display_name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">({b.building_id})</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {b.primary_use}
                    </span>
                    {isCurrentBuilding && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        Active in Dashboard
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {isKwhMode
                        ? `${Math.round(b.totalKwh).toLocaleString()} kWh`
                        : `${b.eui.toFixed(2)} kWh/sqft`}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ({portfolioPct}% of portfolio)
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 group-hover:text-blue-900 group-hover:underline">
                      Filter Dashboard &rarr;
                    </span>
                  </div>
                </div>

                {/* Bar Track & Fill */}
                <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out group-hover:bg-blue-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Subtext info */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5">
                  <span>
                    Gross floor area: <strong className="text-slate-700 font-mono">{b.floor_area_sqft ? b.floor_area_sqft.toLocaleString() : 'N/A'} sqft</strong>
                  </span>
                  <span>
                    Est. Cost: <strong className="text-emerald-700 font-mono">${Math.round(b.costUsd).toLocaleString()}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend & Summary Footer */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
              <span className="font-medium text-slate-700">Monitored Consumption</span>
            </span>
            <span>•</span>
            <span>Portfolio Total: <strong className="text-slate-900 font-mono">{Math.round(totalPortfolioKwh).toLocaleString()} kWh</strong></span>
          </div>
          <span className="text-[11px] text-slate-400">
            Click "Filter" to focus any facility on the time-series line chart.
          </span>
        </div>
      </div>

      {/* Buildings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {buildingStats.map((b) => (
          <div
            key={b.building_id}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-blue-300 transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {b.primary_use}
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-base mt-1.5 leading-snug">
                    {b.display_name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{b.building_id}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Total Electricity</span>
                  <p className="text-base font-extrabold font-mono text-slate-900 mt-0.5">
                    {Math.round(b.totalKwh).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-slate-500">kWh</span>
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Estimated Cost</span>
                  <p className="text-base font-extrabold font-mono text-emerald-700 mt-0.5">
                    ${Math.round(b.costUsd).toLocaleString()}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">EUI Proxy</span>
                  <p className="text-base font-extrabold font-mono text-indigo-700 mt-0.5">
                    {b.eui.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-500">kWh/sqft</span>
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Floor Area</span>
                  <p className="text-base font-extrabold font-mono text-slate-700 mt-0.5">
                    {b.floor_area_sqft ? b.floor_area_sqft.toLocaleString() : 'N/A'}{' '}
                    <span className="text-xs font-normal text-slate-400">sqft</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs">
                {b.anomalyCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-red-700 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> {b.anomalyCount} Flagged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Nominal
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onFilterBuilding(b.building_id)}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
              >
                Focus Dashboard &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Benchmarking Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-sm sm:text-base">
          Comparative Portfolio Benchmarking Table
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px] tracking-wider">
                <th className="py-3 px-3">Building Identifier</th>
                <th className="py-3 px-3">Display Alias</th>
                <th className="py-3 px-3">Primary Space Type</th>
                <th className="py-3 px-3">Gross Area</th>
                <th className="py-3 px-3">Total kWh</th>
                <th className="py-3 px-3">Energy Use Intensity</th>
                <th className="py-3 px-3">Est. Expense (@ ${tariffRate.toFixed(2)})</th>
                <th className="py-3 px-3">Active Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buildingStats.map((b) => (
                <tr key={b.building_id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-3 font-mono text-slate-700">{b.building_id}</td>
                  <td className="py-3 px-3 font-bold text-slate-900">{b.display_name}</td>
                  <td className="py-3 px-3 text-slate-600">{b.primary_use} ({b.sub_use || 'General'})</td>
                  <td className="py-3 px-3 font-mono text-slate-600">
                    {b.floor_area_sqft?.toLocaleString()} sqft
                  </td>
                  <td className="py-3 px-3 font-bold font-mono text-blue-700">
                    {Math.round(b.totalKwh).toLocaleString()} kWh
                  </td>
                  <td className="py-3 px-3 font-bold font-mono text-indigo-700">
                    {b.eui.toFixed(2)} kWh/sqft
                  </td>
                  <td className="py-3 px-3 font-mono text-emerald-700 font-bold">
                    ${Math.round(b.costUsd).toLocaleString()}
                  </td>
                  <td className="py-3 px-3 font-bold text-amber-700">
                    {b.anomalyCount} ({b.criticalAnomalies} critical)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
