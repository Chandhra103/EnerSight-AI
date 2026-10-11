/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  Building2,
  Database,
  DollarSign,
  FileSpreadsheet,
  Globe,
  Layers,
  Leaf,
  Sliders,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { ProvenanceInfo } from '../types/energy.ts';

export type NavTab = 'dashboard' | 'buildings' | 'anomalies' | 'import' | 'impact';
export type DatasetKey = 'bdg2' | 'synthetic' | 'simulated_live' | 'uploaded';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  activeDatasetKey: DatasetKey;
  onSelectDataset: (key: DatasetKey) => void;
  hasUploadedDataset: boolean;
  provenance?: ProvenanceInfo;
  anomalyCount: number;
  tariffRate: number;
  onUpdateTariff: (newRate: number) => void;
  isSimulating?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  activeDatasetKey,
  onSelectDataset,
  hasUploadedDataset,
  provenance,
  anomalyCount,
  tariffRate,
  onUpdateTariff,
  isSimulating = false,
}) => {
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [tempTariff, setTempTariff] = useState(tariffRate.toString());

  const handleSaveTariff = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempTariff);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdateTariff(parsed);
      setShowTariffModal(false);
    }
  };

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Layers className="w-4 h-4" /> },
    { id: 'buildings', label: 'Buildings', icon: <Building2 className="w-4 h-4" /> },
    {
      id: 'anomalies',
      label: 'Anomalies',
      icon: <Activity className="w-4 h-4" />,
      badge: anomalyCount,
    },
    { id: 'import', label: 'Data Sources & Ingestion', icon: <Database className="w-4 h-4" /> },
    { id: 'impact', label: 'Impact & Savings', icon: <TrendingDown className="w-4 h-4" /> },
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            {/* Brand Logo & Tagline */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight text-slate-900">
                    EnerSight <span className="text-blue-700">AI</span>
                  </span>
                  <span className="hidden md:inline-flex text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Zero-Cost Local MVP
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  See Energy Differently. Waste Less. Save More.
                </p>
              </div>
            </div>

            {/* Dataset Selector Control */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto">
              <button
                type="button"
                onClick={() => onSelectDataset('bdg2')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDatasetKey === 'bdg2'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Real BDG2</span>
                <span className="sm:hidden">BDG2</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectDataset('synthetic')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDatasetKey === 'synthetic'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Diagnostic</span>
                <span className="sm:hidden">Faults</span>
              </button>

              <button
                type="button"
                onClick={() => onSelectDataset('simulated_live')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeDatasetKey === 'simulated_live'
                    ? 'bg-white text-purple-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-purple-600 animate-ping' : 'bg-purple-500'}`} />
                <span className="hidden sm:inline">Simulated Live</span>
                <span className="sm:hidden">Live</span>
              </button>

              {hasUploadedDataset && (
                <button
                  type="button"
                  onClick={() => onSelectDataset('uploaded')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeDatasetKey === 'uploaded'
                      ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Custom CSV</span>
                </button>
              )}
            </div>

            {/* Tariff Configurator Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTempTariff(tariffRate.toString());
                  setShowTariffModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                title="Configure electricity tariff rate"
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden md:inline">Rate:</span>
                <span className="font-bold text-slate-900">${tariffRate.toFixed(2)}/kWh</span>
                <Sliders className="w-3 h-3 text-slate-400 ml-0.5" />
              </button>
            </div>
          </div>

          {/* Navigation Bar Tabs */}
          <nav className="flex space-x-1 sm:space-x-4 border-t border-slate-100 overflow-x-auto py-2 scrollbar-none">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-white text-blue-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Dataset Provenance Banner */}
      <div
        className={`border-b text-xs py-1.5 px-4 sm:px-6 lg:px-8 flex items-center justify-between ${
          activeDatasetKey === 'simulated_live'
            ? 'bg-purple-50/80 border-purple-200/80 text-purple-950'
            : provenance?.is_synthetic
            ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
            : 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900'
        }`}
      >
        <div className="max-w-7xl mx-auto w-full flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {activeDatasetKey === 'simulated_live' ? (
              <span className="inline-flex items-center gap-1 font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded text-[11px]">
                <Activity className="w-3 h-3 text-purple-700 animate-pulse" /> SIMULATED DATA (STREAMING)
              </span>
            ) : provenance?.is_synthetic ? (
              <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                <Activity className="w-3 h-3" /> SYNTHETIC BENCHMARK
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                <Globe className="w-3 h-3" /> REAL DATA (BDG2)
              </span>
            )}
            <span className="text-slate-600">
              Source: <strong className="text-slate-900">{provenance?.source_name}</strong>
            </span>
            <span className="hidden sm:inline text-slate-400">|</span>
            <span className="hidden sm:inline text-slate-600">
              License: <span className="font-mono">{provenance?.license}</span>
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-mono">
            Timezone: {provenance?.timezone} ({provenance?.timezone_offset})
          </div>
        </div>
      </div>

      {/* Tariff Adjuster Modal */}
      {showTariffModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Configure Tariff</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTariffModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Cost approximations are calculated as <code className="bg-slate-100 px-1 py-0.5 rounded">kWh × Rate</code>.
              Adjust your organization's blended commercial tariff below.
            </p>

            <form onSubmit={handleSaveTariff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Electricity Rate ($ / kWh)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    value={tempTariff}
                    onChange={(e) => setTempTariff(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
                    placeholder="0.14"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Default benchmark: $0.14/kWh (US commercial average proxy).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTariffModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Apply Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
