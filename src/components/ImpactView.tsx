/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  Info,
  Leaf,
  ShieldCheck,
  TrendingDown,
  Wrench,
  Zap,
} from 'lucide-react';
import { DatasetBundle, DetectedAnomaly } from '../types/energy.ts';
import { getBuildingDisplayName } from '../utils/buildingUtils.ts';

interface ImpactViewProps {
  dataset: DatasetBundle;
  anomalies: DetectedAnomaly[];
  tariffRate: number;
  onFilterBuilding?: (buildingId: string) => void;
}

export const ImpactView: React.FC<ImpactViewProps> = ({
  dataset,
  anomalies,
  tariffRate,
  onFilterBuilding,
}) => {
  const [chartMetric, setChartMetric] = useState<'financial' | 'energy'>('financial');
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  // Estimated Potential Savings (Theoretical excess)
  const potentialExcessKwh = useMemo(() => {
    return anomalies.reduce((acc, a) => acc + (a.explanation.excess_kwh || 0), 0);
  }, [anomalies]);

  const potentialSavingsUsd = useMemo(() => {
    return potentialExcessKwh * tariffRate;
  }, [potentialExcessKwh, tariffRate]);

  // Verified Savings (Logged only after field resolution)
  const verifiedActions = useMemo(() => {
    return anomalies.filter(
      (a) =>
        (a.status === 'resolved' || a.status === 'action_taken') &&
        (a.verified_savings_kwh || a.logged_action_notes)
    );
  }, [anomalies]);

  const verifiedSavingsKwh = useMemo(() => {
    return anomalies.reduce((acc, a) => acc + (a.verified_savings_kwh || 0), 0);
  }, [anomalies]);

  const verifiedSavingsUsd = useMemo(() => {
    return verifiedSavingsKwh * tariffRate;
  }, [verifiedSavingsKwh, tariffRate]);

  // Estimated Carbon Footprint Reduction (Proxy: ~0.385 kg CO2e / kWh U.S. EPA eGRID average)
  const carbonFactorKgPerKwh = 0.385;
  const verifiedCarbonAvoidedMetricTons = (verifiedSavingsKwh * carbonFactorKgPerKwh) / 1000;
  const potentialCarbonAvoidedMetricTons = (potentialExcessKwh * carbonFactorKgPerKwh) / 1000;

  // Grouped Bar Chart Data comparing Estimated vs Verified across facilities and portfolio
  const groupedComparisonData = useMemo(() => {
    const bldGroups = dataset.buildings.map((b) => {
      const bAnomalies = anomalies.filter((a) => a.building_id === b.building_id);
      const estKwh = bAnomalies.reduce((acc, a) => acc + (a.explanation.excess_kwh || 0), 0);
      const estUsd = estKwh * tariffRate;
      const verKwh = bAnomalies.reduce((acc, a) => acc + (a.verified_savings_kwh || 0), 0);
      const verUsd = verKwh * tariffRate;

      return {
        id: b.building_id,
        name: b.display_name,
        primaryUse: b.primary_use,
        estKwh,
        estUsd,
        verKwh,
        verUsd,
      };
    });

    const portfolioGroup = {
      id: 'PORTFOLIO_TOTAL',
      name: 'Portfolio Aggregate',
      primaryUse: 'All Facilities Combined',
      estKwh: potentialExcessKwh,
      estUsd: potentialSavingsUsd,
      verKwh: verifiedSavingsKwh,
      verUsd: verifiedSavingsUsd,
    };

    const allGroups = [...bldGroups, portfolioGroup];
    const maxUsd = Math.max(...allGroups.map((g) => Math.max(g.estUsd, g.verUsd)), 1);
    const maxKwh = Math.max(...allGroups.map((g) => Math.max(g.estKwh, g.verKwh)), 1);

    return {
      groups: allGroups,
      maxUsd,
      maxKwh,
    };
  }, [dataset.buildings, anomalies, tariffRate, potentialExcessKwh, potentialSavingsUsd, verifiedSavingsKwh, verifiedSavingsUsd]);

  const exportAuditSummary = () => {
    const report = {
      project: 'EnerSight AI Environmental Audit Summary',
      generated_at: new Date().toISOString(),
      dataset_source: dataset.provenance.source_name,
      license: dataset.provenance.license,
      buildings_count: dataset.buildings.length,
      readings_evaluated: dataset.readings.length,
      tariff_rate_applied: `$${tariffRate.toFixed(2)}/kWh`,
      estimated_potential_excess_kwh: potentialExcessKwh,
      estimated_potential_cost_exposure_usd: potentialSavingsUsd,
      verified_measured_savings_kwh: verifiedSavingsKwh,
      verified_measured_savings_usd: verifiedSavingsUsd,
      verified_co2e_avoided_metric_tons: verifiedCarbonAvoidedMetricTons,
      investigated_actions_log: verifiedActions.map((a) => ({
        anomaly_id: a.anomaly_id,
        building_id: a.building_id,
        timestamp: a.timestamp,
        status: a.status,
        verified_savings_kwh: a.verified_savings_kwh || 0,
        notes: a.logged_action_notes || 'No notes',
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enersight_impact_audit_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-emerald-600" />
            Dual-Ledger Impact & Verified Savings Tracker
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            EnerSight AI enforces strict segregation between theoretical potential exposure and empirical,
            verified savings confirmed by subsequent measurements.
          </p>
        </div>

        <button
          type="button"
          onClick={exportAuditSummary}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          Export Audit Report (JSON)
        </button>
      </div>

      {/* Dual Ledger Core Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ledger 1: Estimated Potential Savings */}
        <div className="bg-white rounded-2xl border border-blue-200 p-6 shadow-xs space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              Ledger A: Theoretical Potential
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-500 uppercase">Estimated Potential Savings</span>
            <div className="text-3xl font-black text-slate-900 font-mono tracking-tight mt-1">
              ${potentialSavingsUsd.toFixed(2)}{' '}
              <span className="text-sm font-semibold text-slate-500">USD</span>
            </div>
            <p className="text-xs text-blue-800 font-medium mt-1">
              {Math.round(potentialExcessKwh).toLocaleString()} excess kWh above baseline cutoffs
            </p>
          </div>

          <div className="bg-blue-50/60 rounded-xl p-3 text-xs text-blue-900 space-y-1 border border-blue-100">
            <p className="font-semibold flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              Accounting Methodology & Assumptions:
            </p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Represents the cost exposure if all flagged statistical baseline deviations were fully
              avoidable equipment waste. Does <strong>not</strong> represent guaranteed savings until verified by follow-up audits.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Potential GHG Avoidance:</span>
            <span className="font-bold text-slate-800">
              {potentialCarbonAvoidedMetricTons.toFixed(2)} Metric Tons CO₂e
            </span>
          </div>
        </div>

        {/* Ledger 2: Verified Measured Savings */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-xs space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              Ledger B: Empirical Verification
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-500 uppercase">Verified Measured Savings</span>
            <div className="text-3xl font-black text-emerald-700 font-mono tracking-tight mt-1">
              ${verifiedSavingsUsd.toFixed(2)}{' '}
              <span className="text-sm font-semibold text-slate-500">USD</span>
            </div>
            <p className="text-xs text-emerald-800 font-medium mt-1">
              {verifiedSavingsKwh.toFixed(1)} kWh empirically confirmed by facility work orders
            </p>
          </div>

          <div className="bg-emerald-50/60 rounded-xl p-3 text-xs text-emerald-900 space-y-1 border border-emerald-100">
            <p className="font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Audited Verification Protocol:
            </p>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              This total strictly increments only when a facility manager inspects a flagged equipment anomaly,
              logs a completed maintenance action, and records verified post-resolution measurements.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Verified GHG Reduction:</span>
            <span className="font-bold text-emerald-800">
              {verifiedCarbonAvoidedMetricTons.toFixed(2)} Metric Tons CO₂e
            </span>
          </div>
        </div>
      </div>

      {/* Grouped Bar Chart: Estimated Potential vs Verified Savings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              Savings Reconciliation: Potential vs. Verified (Grouped Bar Chart)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Empirical accounting comparison contrasting theoretical baseline deviations against logged post-remediation savings.
            </p>
          </div>

          {/* Metric Toggle */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-semibold">
            <button
              type="button"
              onClick={() => setChartMetric('financial')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMetric === 'financial'
                  ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Financial ($ USD)
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('energy')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartMetric === 'energy'
                  ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Energy (kWh)
            </button>
          </div>
        </div>

        {/* Grouped Bars Container */}
        <div className="space-y-4 pt-1">
          {groupedComparisonData.groups.map((group) => {
            const isFinancial = chartMetric === 'financial';
            const estVal = isFinancial ? group.estUsd : group.estKwh;
            const verVal = isFinancial ? group.verUsd : group.verKwh;
            const maxVal = isFinancial ? groupedComparisonData.maxUsd : groupedComparisonData.maxKwh;

            const estPct = Math.min(100, Math.max(2, Math.round((estVal / maxVal) * 100)));
            const verPct = Math.min(100, Math.max(0, Math.round((verVal / maxVal) * 100)));
            const conversionPct = estVal > 0 ? ((verVal / estVal) * 100).toFixed(1) : '0.0';

            return (
              <div
                key={group.id}
                onMouseEnter={() => setHoveredGroupId(group.id)}
                onMouseLeave={() => setHoveredGroupId(null)}
                onClick={() => {
                  if (group.id !== 'PORTFOLIO_TOTAL' && onFilterBuilding) {
                    onFilterBuilding(group.id);
                  }
                }}
                className={`p-4 rounded-xl border transition-all ${
                  group.id !== 'PORTFOLIO_TOTAL' && onFilterBuilding ? 'cursor-pointer' : ''
                } ${
                  hoveredGroupId === group.id
                    ? 'border-blue-400 bg-blue-50/30 shadow-xs'
                    : group.id === 'PORTFOLIO_TOTAL'
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-150 hover:border-slate-300 hover:bg-slate-50/40'
                }`}
                title={
                  group.id !== 'PORTFOLIO_TOTAL' && onFilterBuilding
                    ? `Click to view ${group.name} on Dashboard`
                    : undefined
                }
              >
                {/* Header for group */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {group.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      ({group.id})
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {group.primaryUse}
                    </span>
                    {group.id !== 'PORTFOLIO_TOTAL' && onFilterBuilding && (
                      <span className="text-[10px] font-bold text-blue-700 underline opacity-0 group-hover:opacity-100 transition-opacity">
                        View Dashboard &rarr;
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Realization Rate:</span>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded-md text-[11px] ${
                        verVal > 0
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {conversionPct}% Verified
                    </span>
                  </div>
                </div>

                {/* Grouped Dual Bars */}
                <div className="space-y-2">
                  {/* Bar 1: Estimated Potential */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-blue-700 font-semibold flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block" />
                        Estimated Potential Savings (Ledger A)
                      </span>
                      <span className="font-mono font-bold text-blue-800">
                        {isFinancial ? `$${estVal.toFixed(2)}` : `${Math.round(estVal).toLocaleString()} kWh`}
                      </span>
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${estPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Bar 2: Verified Measured */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                        Verified Measured Savings (Ledger B)
                      </span>
                      <span className="font-mono font-bold text-emerald-800">
                        {isFinancial ? `$${verVal.toFixed(2)}` : `${verVal.toFixed(1)} kWh`}
                        {verVal === 0 && ' (Awaiting Field Verification)'}
                      </span>
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(verVal > 0 ? 3 : 0, verPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend & Accounting Rule */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
              <span className="font-medium text-slate-700">Ledger A: Estimated Theoretical Potential</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
              <span className="font-medium text-slate-700">Ledger B: Empirical Verified Savings</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Segregation strictly prevents premature reporting of unverified energy claims.
          </span>
        </div>
      </div>

      {/* Recorded Maintenance Log */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Recorded Investigation & Maintenance Log
            </h3>
            <p className="text-xs text-slate-500">
              Auditable history of actions taken by facility engineers on flagged anomalies.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
            {verifiedActions.length} Actions Logged
          </span>
        </div>

        {verifiedActions.length === 0 ? (
          <div className="py-10 text-center text-slate-400 space-y-2">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-600">
              No maintenance actions logged yet.
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Go to the <strong>Anomalies</strong> tab, select any flagged reading, click "Investigate",
              and log physical corrective actions to populate this audit trail.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {verifiedActions.map((a) => (
              <div key={a.anomaly_id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {getBuildingDisplayName(a.building_id, dataset.buildings)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      ({a.building_id})
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {new Date(a.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full capitalize">
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-700 italic">
                    "{a.logged_action_notes || 'Action logged without detailed notes.'}"
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Verified Reduction</span>
                  <span className="font-bold font-mono text-emerald-700 text-sm">
                    {a.verified_savings_kwh ? `+${a.verified_savings_kwh} kWh` : 'Pending Metric'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Environmental & Carbon Accounting Transparency Note */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Leaf className="w-4 h-4 text-emerald-600" />
          Carbon Methodology Transparency Disclaimer
        </div>
        <p className="leading-relaxed text-[11px]">
          Carbon emissions avoided are estimated using a standard national average emission factor of{' '}
          <strong>0.385 kg CO₂e / kWh</strong> (U.S. EPA eGRID proxy). True marginal grid emissions vary continuously
          by time-of-day and regional generation mix (hydro, solar, gas, coal). EnerSight AI provides this calculation
          as an illustrative proxy and does not certify carbon offset credits.
        </p>
      </div>
    </div>
  );
};
