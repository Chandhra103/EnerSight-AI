/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Globe,
  Leaf,
  Loader2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { AnomalyDetailModal } from './components/AnomalyDetailModal.tsx';
import { AnomaliesView } from './components/AnomaliesView.tsx';
import { BuildingsView } from './components/BuildingsView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DataImportView } from './components/DataImportView.tsx';
import { ImpactView } from './components/ImpactView.tsx';
import { DatasetKey, Navbar, NavTab } from './components/Navbar.tsx';
import { DatasetBundle, DetectedAnomaly } from './types/energy.ts';
import { detectEnergyAnomalies } from './utils/anomalyDetection.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [activeDatasetKey, setActiveDatasetKey] = useState<DatasetKey>('bdg2');

  const [bdg2Data, setBdg2Data] = useState<DatasetBundle | null>(null);
  const [syntheticData, setSyntheticData] = useState<DatasetBundle | null>(null);
  const [uploadedData, setUploadedData] = useState<DatasetBundle | null>(null);

  // Progressive Simulated Live Stream state
  const [simIndex, setSimIndex] = useState<number>(48); // Start with 48 hours as baseline
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simSpeedMs, setSimSpeedMs] = useState<number>(1000); // 1s per interval

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Progressive timer effect for Simulated Live Data
  useEffect(() => {
    if (!isSimulating) return;

    const timer = setInterval(() => {
      setSimIndex((prev) => {
        if (!syntheticData || prev >= syntheticData.readings.length) {
          setIsSimulating(false);
          return prev;
        }
        return prev + 1;
      });
    }, simSpeedMs);

    return () => clearInterval(timer);
  }, [isSimulating, simSpeedMs, syntheticData]);

  // User configurable tariff rate (default $0.14 / kWh)
  const [tariffRate, setTariffRate] = useState<number>(0.14);

  // Global shared filter state across tabs
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('ALL');
  const [selectedSeverityFilter, setSelectedSeverityFilter] = useState<string>('ALL');

  // Modal inspection state
  const [selectedAnomaly, setSelectedAnomaly] = useState<DetectedAnomaly | null>(null);

  // Local anomaly status updates map: anomalyId -> { status, notes, verifiedSavings }
  const [anomalyOverrides, setAnomalyOverrides] = useState<
    Record<
      string,
      {
        status: DetectedAnomaly['status'];
        notes?: string;
        verifiedSavings?: number;
      }
    >
  >({});

  // 1. Initial Load of Bundled Assets
  useEffect(() => {
    async function loadInitialAssets() {
      try {
        setLoading(true);
        const [bdg2Res, benchRes] = await Promise.all([
          fetch('/data/sample_bdg2.json'),
          fetch('/data/benchmark_faults.json'),
        ]);

        if (!bdg2Res.ok) {
          throw new Error(`Failed to load BDG2 asset (HTTP ${bdg2Res.status})`);
        }
        if (!benchRes.ok) {
          throw new Error(`Failed to load benchmark asset (HTTP ${benchRes.status})`);
        }

        const bdg2Json: DatasetBundle = await bdg2Res.json();
        const benchJson: DatasetBundle = await benchRes.json();

        setBdg2Data(bdg2Json);
        setSyntheticData(benchJson);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize dataset assets';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    loadInitialAssets();
  }, []);

  // Construct progressive Simulated Live dataset
  const simulatedLiveDataset: DatasetBundle | null = useMemo(() => {
    if (!syntheticData) return null;
    const currentReadings = syntheticData.readings.slice(0, simIndex).map((r) => ({
      ...r,
      is_synthetic: true,
      simulated_fault_type: r.simulated_fault_type || 'SIMULATED DATA',
    }));
    const lastReading = currentReadings[currentReadings.length - 1];

    return {
      provenance: {
        ...syntheticData.provenance,
        source_name: 'Simulated Live Ingestion Feed (SIM_BLDG_01)',
        citation: 'Progressive live streaming simulation (SIMULATED DATA)',
        is_synthetic: true,
        total_readings: currentReadings.length,
        time_range_end: lastReading?.timestamp || syntheticData.provenance.time_range_end,
      },
      buildings: syntheticData.buildings,
      readings: currentReadings,
      fault_specifications: syntheticData.fault_specifications,
    };
  }, [syntheticData, simIndex]);

  // 2. Active Dataset Selection
  const activeDataset: DatasetBundle | null = useMemo(() => {
    if (activeDatasetKey === 'bdg2') return bdg2Data;
    if (activeDatasetKey === 'synthetic') return syntheticData;
    if (activeDatasetKey === 'simulated_live') return simulatedLiveDataset;
    if (activeDatasetKey === 'uploaded') return uploadedData;
    return bdg2Data;
  }, [activeDatasetKey, bdg2Data, syntheticData, simulatedLiveDataset, uploadedData]);

  // 3. Dynamic Anomaly Detection with Overrides applied
  const detectedAnomalies = useMemo(() => {
    if (!activeDataset || !activeDataset.readings || activeDataset.readings.length === 0) {
      return [];
    }

    // Run explainable Median/MAD engine
    const result = detectEnergyAnomalies(activeDataset.readings, {
      robustZThreshold: 3.0,
      minSamplesPerBin: 3,
      tariffUsdPerKwh: tariffRate,
    });

    // Apply any local maintenance status overrides
    return result.anomalies.map((a) => {
      const override = anomalyOverrides[a.anomaly_id];
      if (override) {
        return {
          ...a,
          status: override.status,
          logged_action_notes: override.notes,
          verified_savings_kwh: override.verifiedSavings,
          verified_savings_usd:
            override.verifiedSavings !== undefined ? override.verifiedSavings * tariffRate : undefined,
        };
      }
      return a;
    });
  }, [activeDataset, tariffRate, anomalyOverrides]);

  // 4. Update an anomaly's status or verified savings
  const handleUpdateAnomalyStatus = (
    anomalyId: string,
    status: DetectedAnomaly['status'],
    notes?: string,
    verifiedSavingsKwh?: number
  ) => {
    setAnomalyOverrides((prev) => ({
      ...prev,
      [anomalyId]: {
        status,
        notes,
        verifiedSavings: verifiedSavingsKwh,
      },
    }));

    if (selectedAnomaly && selectedAnomaly.anomaly_id === anomalyId) {
      setSelectedAnomaly((prev) =>
        prev
          ? {
              ...prev,
              status,
              logged_action_notes: notes,
              verified_savings_kwh: verifiedSavingsKwh,
            }
          : null
      );
    }
  };

  // 5. User Uploaded Dataset handler
  const handleLoadCustomDataset = (bundle: DatasetBundle) => {
    setUploadedData(bundle);
    setActiveDatasetKey('uploaded');
    setCurrentTab('dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased flex flex-col font-sans">
      {/* Interactive Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activeDatasetKey={activeDatasetKey}
        onSelectDataset={setActiveDatasetKey}
        hasUploadedDataset={!!uploadedData}
        provenance={activeDataset?.provenance}
        anomalyCount={detectedAnomalies.length}
        tariffRate={tariffRate}
        onUpdateTariff={setTariffRate}
        isSimulating={isSimulating}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {loading ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-600">
              Loading energy analytics workspace...
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3 max-w-lg mx-auto mt-12">
            <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
            <h3 className="font-extrabold text-red-900 text-base">Workspace Load Error</h3>
            <p className="text-xs text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        ) : !activeDataset ? (
          <div className="text-center py-16 space-y-3">
            <Database className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No active dataset selected</p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardView
                dataset={activeDataset}
                anomalies={detectedAnomalies}
                tariffRate={tariffRate}
                onSelectAnomaly={setSelectedAnomaly}
                onNavigateTab={(tab, filter) => {
                  if (tab === 'anomalies' && filter) {
                    setSelectedSeverityFilter(filter);
                  }
                  setCurrentTab(tab);
                }}
                selectedBuildingId={selectedBuildingId}
                onSelectBuildingId={setSelectedBuildingId}
              />
            )}

            {currentTab === 'buildings' && (
              <BuildingsView
                dataset={activeDataset}
                anomalies={detectedAnomalies}
                tariffRate={tariffRate}
                selectedBuildingId={selectedBuildingId}
                onFilterBuilding={(buildingId) => {
                  setSelectedBuildingId(buildingId);
                  setCurrentTab('dashboard');
                }}
              />
            )}

            {currentTab === 'anomalies' && (
              <AnomaliesView
                anomalies={detectedAnomalies}
                onSelectAnomaly={setSelectedAnomaly}
                tariffRate={tariffRate}
                buildings={activeDataset.buildings}
                selectedSeverityFilter={selectedSeverityFilter}
                onSelectSeverityFilter={setSelectedSeverityFilter}
                selectedBuildingId={selectedBuildingId}
                onSelectBuildingId={setSelectedBuildingId}
              />
            )}

            {currentTab === 'import' && (
              <DataImportView
                onLoadCustomDataset={handleLoadCustomDataset}
                activeDatasetKey={activeDatasetKey}
                onSelectDataset={setActiveDatasetKey}
                bdg2Dataset={bdg2Data}
                syntheticDataset={syntheticData}
                uploadedDataset={uploadedData}
                isSimulating={isSimulating}
                simIndex={simIndex}
                totalSimReadings={syntheticData?.readings.length || 336}
                simSpeedMs={simSpeedMs}
                lastProcessedTimestamp={
                  activeDataset?.readings[activeDataset.readings.length - 1]?.timestamp
                }
                onStartSimulation={() => {
                  setActiveDatasetKey('simulated_live');
                  setIsSimulating(true);
                }}
                onPauseSimulation={() => setIsSimulating(false)}
                onResetSimulation={() => {
                  setIsSimulating(false);
                  setSimIndex(24);
                }}
                onChangeSimSpeed={setSimSpeedMs}
                onNavigateTab={(tab) => setCurrentTab(tab)}
              />
            )}

            {currentTab === 'impact' && (
              <ImpactView
                dataset={activeDataset}
                anomalies={detectedAnomalies}
                tariffRate={tariffRate}
                onFilterBuilding={(buildingId) => {
                  setSelectedBuildingId(buildingId);
                  setCurrentTab('dashboard');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Investigation Details Modal */}
      {selectedAnomaly && (
        <AnomalyDetailModal
          anomaly={selectedAnomaly}
          readings={activeDataset?.readings}
          onClose={() => setSelectedAnomaly(null)}
          onUpdateStatus={handleUpdateAnomalyStatus}
          tariffRate={tariffRate}
          buildings={activeDataset?.buildings}
        />
      )}

      {/* Footer & License Attribution */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
              <Leaf className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-slate-800">EnerSight AI</span>
            <span>—</span>
            <span>Environmental Energy Analytics & Anomaly Detection</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span>
              Real Dataset Citation: <strong>Miller et al., Nature Scientific Data (2020)</strong>
            </span>
            <span>•</span>
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">CC BY 4.0 License</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold">100% Zero-Cost Local Runtime</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
