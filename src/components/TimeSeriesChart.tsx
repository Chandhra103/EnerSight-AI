/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Calendar,
  ChevronRight,
  Info,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { BuildingMetadata, DetectedAnomaly, EnergyReading } from '../types/energy.ts';
import {
  formatAnomalyPlainEnglish,
  formatSignedMadScore,
  getBuildingDisplayName,
} from '../utils/buildingUtils.ts';

export type ChartTimeRange = 'all' | '14d' | '7d' | '24h';

interface TimeSeriesChartProps {
  readings: EnergyReading[];
  anomalies: DetectedAnomaly[];
  selectedBuildingId: string;
  buildings?: BuildingMetadata[];
  onSelectAnomaly: (anomaly: DetectedAnomaly) => void;
}

interface ChartPoint {
  index: number;
  timestamp: string;
  consumptionKwh: number;
  rawCount: number;
  isAggregated: boolean;
  anomaly?: DetectedAnomaly;
  anomaliesList?: DetectedAnomaly[];
  x: number;
  y: number;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  readings,
  anomalies,
  selectedBuildingId,
  buildings,
  onSelectAnomaly,
}) => {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>('all');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [forceHourly, setForceHourly] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId();

  // 1. Building display label
  const activeBuildingName = useMemo(() => {
    if (selectedBuildingId === 'ALL') {
      const bCount = buildings?.length || 3;
      return `Portfolio Aggregate (${bCount} Monitored Facilities)`;
    }
    return getBuildingDisplayName(selectedBuildingId, buildings);
  }, [selectedBuildingId, buildings]);

  // 2. Anomaly lookup map (by timestamp or reading_id)
  const anomalyLookup = useMemo(() => {
    const byKey = new Map<string, DetectedAnomaly[]>();
    for (const a of anomalies) {
      if (selectedBuildingId === 'ALL' || a.building_id === selectedBuildingId) {
        // Index by timestamp
        const tKey = a.timestamp;
        if (!byKey.has(tKey)) {
          byKey.set(tKey, []);
        }
        byKey.get(tKey)!.push(a);

        // Also index by reading_id
        if (a.reading_id) {
          if (!byKey.has(a.reading_id)) {
            byKey.set(a.reading_id, []);
          }
          byKey.get(a.reading_id)!.push(a);
        }
      }
    }
    return byKey;
  }, [anomalies, selectedBuildingId]);

  // 3. Prepare interval series:
  // When selectedBuildingId === 'ALL', aggregate readings sharing the exact same timestamp into portfolio total kWh.
  // When selectedBuildingId !== 'ALL', use that facility's readings.
  const intervalSeries = useMemo(() => {
    if (readings.length === 0) return [];

    if (selectedBuildingId !== 'ALL') {
      const filtered = readings.filter((r) => r.building_id === selectedBuildingId);
      return [...filtered]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((r) => {
          const matchingAnoms = anomalyLookup.get(r.timestamp) || [];
          return {
            timestamp: r.timestamp,
            consumptionKwh: r.consumption_kwh,
            rawCount: 1,
            anomaly: matchingAnoms[0],
            anomaliesList: matchingAnoms,
          };
        });
    }

    // Portfolio Mode ('ALL'): group by timestamp to prevent multi-building zig-zagging
    const timestampMap = new Map<string, { totalKwh: number; count: number }>();
    for (const r of readings) {
      const prev = timestampMap.get(r.timestamp);
      if (prev) {
        prev.totalKwh += r.consumption_kwh;
        prev.count += 1;
      } else {
        timestampMap.set(r.timestamp, { totalKwh: r.consumption_kwh, count: 1 });
      }
    }

    const sortedTimestamps = Array.from(timestampMap.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return sortedTimestamps.map((t) => {
      const data = timestampMap.get(t)!;
      const matchingAnoms = anomalyLookup.get(t) || [];
      return {
        timestamp: t,
        consumptionKwh: Math.round(data.totalKwh * 10) / 10,
        rawCount: data.count,
        anomaly: matchingAnoms[0],
        anomaliesList: matchingAnoms,
      };
    });
  }, [readings, selectedBuildingId, anomalyLookup]);

  // 4. Apply Time Range window filter
  const windowedSeries = useMemo(() => {
    if (intervalSeries.length === 0) return [];
    if (timeRange === 'all') return intervalSeries;

    const total = intervalSeries.length;
    if (timeRange === '24h') return intervalSeries.slice(Math.max(0, total - 24));
    if (timeRange === '7d') return intervalSeries.slice(Math.max(0, total - 24 * 7));
    if (timeRange === '14d') return intervalSeries.slice(Math.max(0, total - 24 * 14));
    return intervalSeries;
  }, [intervalSeries, timeRange]);

  // 5. Intelligent Sensible Aggregation for long time ranges ('all' with > 120 points)
  // When viewing full 60-day dataset, plotting 1,464 points produces an illegible crowded black stroke.
  // We aggregate to daily average with peak preservation, unless user clicks "Hourly Detail".
  const { chartData, isDailyAggregated } = useMemo(() => {
    if (windowedSeries.length === 0) {
      return { chartData: [], isDailyAggregated: false };
    }

    const shouldAggregate = timeRange === 'all' && windowedSeries.length > 120 && !forceHourly;

    if (!shouldAggregate) {
      return {
        chartData: windowedSeries.map((item) => ({
          ...item,
          isAggregated: false,
        })),
        isDailyAggregated: false,
      };
    }

    // Group by Day (YYYY-MM-DD)
    const dayGroups = new Map<
      string,
      {
        timestamp: string;
        totalKwh: number;
        count: number;
        peakKwh: number;
        anomalies: DetectedAnomaly[];
      }
    >();

    for (const item of windowedSeries) {
      const dayKey = item.timestamp.split('T')[0];
      const prev = dayGroups.get(dayKey);
      if (prev) {
        prev.totalKwh += item.consumptionKwh;
        prev.count += 1;
        if (item.consumptionKwh > prev.peakKwh) prev.peakKwh = item.consumptionKwh;
        if (item.anomaliesList && item.anomaliesList.length > 0) {
          prev.anomalies.push(...item.anomaliesList);
        }
      } else {
        dayGroups.set(dayKey, {
          timestamp: item.timestamp,
          totalKwh: item.consumptionKwh,
          count: 1,
          peakKwh: item.consumptionKwh,
          anomalies: item.anomaliesList ? [...item.anomaliesList] : [],
        });
      }
    }

    const aggregated = Array.from(dayGroups.values()).map((g) => {
      // Pick highest severity anomaly for the day if present
      const sortedAnoms = [...g.anomalies].sort((a, b) => {
        const rank = { critical: 4, high: 3, medium: 2, low: 1 };
        return (rank[b.severity] || 0) - (rank[a.severity] || 0);
      });

      return {
        timestamp: g.timestamp,
        consumptionKwh: Math.round((g.totalKwh / Math.max(1, g.count)) * 10) / 10,
        rawCount: g.count,
        isAggregated: true,
        anomaly: sortedAnoms[0],
        anomaliesList: sortedAnoms,
      };
    });

    return { chartData: aggregated, isDailyAggregated: true };
  }, [windowedSeries, timeRange, forceHourly]);

  // 6. SVG Geometry Calculations
  const width = 940;
  const height = 310;
  const padding = { top: 25, right: 35, bottom: 50, left: 65 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const { points, minKwh, maxKwh, yTicks } = useMemo(() => {
    if (chartData.length === 0) {
      return { points: [], minKwh: 0, maxKwh: 100, yTicks: [0, 25, 50, 75, 100] };
    }

    let min = Infinity;
    let max = -Infinity;

    for (const d of chartData) {
      if (d.consumptionKwh < min) min = d.consumptionKwh;
      if (d.consumptionKwh > max) max = d.consumptionKwh;
    }

    // Give visual breathing room on Y axis
    const yMin = Math.max(0, Math.floor(min * 0.85));
    const yMax = Math.ceil(max * 1.15) || 100;
    const yRange = Math.max(1, yMax - yMin);

    const n = chartData.length;
    const computedPoints: ChartPoint[] = chartData.map((d, i) => {
      const x = padding.left + (i / Math.max(1, n - 1)) * innerWidth;
      const y = padding.top + innerHeight - ((d.consumptionKwh - yMin) / yRange) * innerHeight;
      return {
        index: i,
        timestamp: d.timestamp,
        consumptionKwh: d.consumptionKwh,
        rawCount: d.rawCount,
        isAggregated: d.isAggregated,
        anomaly: d.anomaly,
        anomaliesList: d.anomaliesList,
        x,
        y,
      };
    });

    // 5 clean evenly spaced ticks on Y-axis
    const step = yRange / 4;
    const ticks = [0, 1, 2, 3, 4].map((stepIdx) => Math.round(yMin + stepIdx * step));

    return { points: computedPoints, minKwh: yMin, maxKwh: yMax, yTicks: ticks };
  }, [chartData, innerWidth, innerHeight, padding.left, padding.top]);

  // 7. SVG Path string
  const pathD = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const bottom = padding.top + innerHeight;
    return `${pathD} L ${last.x.toFixed(1)} ${bottom.toFixed(1)} L ${first.x.toFixed(1)} ${bottom.toFixed(1)} Z`;
  }, [pathD, points, padding.top, innerHeight]);

  // 8. Filtered Date Ticks on X-Axis (6 to 8 nicely spaced ticks)
  const xTicks = useMemo(() => {
    if (points.length === 0) return [];
    const maxTicks = points.length <= 24 ? 6 : 8;
    const step = Math.max(1, Math.floor(points.length / (maxTicks - 1)));
    const ticks: ChartPoint[] = [];

    for (let i = 0; i < points.length; i += step) {
      ticks.push(points[i]);
    }
    // Ensure final point is marked
    const lastPt = points[points.length - 1];
    if (ticks[ticks.length - 1].index !== lastPt.index) {
      ticks.push(lastPt);
    }
    return ticks;
  }, [points]);

  // 9. Interactive mouse & touch handler for crosshair scrubbing
  const handlePointerMove = (clientX: number) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const svgX = (relativeX / rect.width) * width;

    // Find closest point by x coordinate
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    handlePointerMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches && e.touches.length > 0) {
      handlePointerMove(e.touches[0].clientX);
    }
  };

  const activeHoverPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  // 10. Distinct anomaly markers only (filtering to avoid cluttering normal line)
  const anomalyMarkers = useMemo(() => {
    return points.filter((p) => !!p.anomaly);
  }, [points]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      {/* Chart Header & Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
              Electricity Demand & Anomaly Trend
            </h3>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              {activeBuildingName}
            </span>
            {isDailyAggregated && (
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Daily Aggregated (Smooth Curve)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isDailyAggregated
              ? 'Showing 61-day daily average load curve with peak anomaly flags highlighted. Switch to 14D / 7D / 24H for hourly granularity.'
              : `Showing ${points.length} consecutive hourly load intervals in kWh with statistical baseline flags.`}
          </p>
        </div>

        {/* Time Window Buttons & Aggregation Toggle */}
        <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto justify-between lg:justify-end">
          {timeRange === 'all' && windowedSeries.length > 120 && (
            <button
              type="button"
              onClick={() => setForceHourly(!forceHourly)}
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-slate-200"
              title="Toggle between daily smoothed curve and raw hourly load line"
            >
              {forceHourly ? 'Switch to Daily Smoothed' : 'View Raw Hourly (1,464 pts)'}
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(
              [
                { id: 'all', label: 'All Data' },
                { id: '14d', label: '14D' },
                { id: '7d', label: '7D' },
                { id: '24h', label: '24H' },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setTimeRange(btn.id)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  timeRange === btn.id
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden select-none">
        {points.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Calendar className="w-8 h-8 text-slate-300" />
            <p className="text-xs">No electricity intervals available for this selection.</p>
          </div>
        ) : (
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto cursor-crosshair overflow-visible touch-none"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
              onTouchStart={handleTouchMove}
              onTouchMove={handleTouchMove}
              onTouchEnd={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
                  <stop offset="90%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {yTicks.map((val, idx) => {
                const y =
                  padding.top +
                  innerHeight -
                  ((val - minKwh) / Math.max(1, maxKwh - minKwh)) * innerHeight;
                return (
                  <g key={idx}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      className="text-[10px] fill-slate-400 font-mono"
                    >
                      {val.toLocaleString()} kWh
                    </text>
                  </g>
                );
              })}

              {/* Area gradient fill */}
              <path d={areaD} fill={`url(#${gradientId})`} />

              {/* Clean continuous Time-Series Line (no dots on every reading to prevent clutter) */}
              <path
                d={pathD}
                fill="none"
                stroke="#2563eb"
                strokeWidth={isDailyAggregated ? 2.5 : 1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* X-Axis Horizontal Baseline */}
              <line
                x1={padding.left}
                y1={padding.top + innerHeight}
                x2={width - padding.right}
                y2={padding.top + innerHeight}
                stroke="#cbd5e1"
                strokeWidth="1"
              />

              {/* X-Axis Date/Time Ticks & Labels */}
              {xTicks.map((tick, i) => {
                const d = new Date(tick.timestamp);
                const is24h = timeRange === '24h';
                const dateLabel = is24h
                  ? `${d.getHours().toString().padStart(2, '0')}:00`
                  : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                const subLabel = is24h
                  ? `${d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}`
                  : `${d.getHours().toString().padStart(2, '0')}:00`;

                return (
                  <g key={i}>
                    <line
                      x1={tick.x}
                      y1={padding.top + innerHeight}
                      x2={tick.x}
                      y2={padding.top + innerHeight + 4}
                      stroke="#94a3b8"
                      strokeWidth="1"
                    />
                    <text
                      x={tick.x}
                      y={padding.top + innerHeight + 17}
                      textAnchor="middle"
                      className="text-[10px] font-semibold fill-slate-600 font-sans"
                    >
                      {dateLabel}
                    </text>
                    {!isDailyAggregated && (
                      <text
                        x={tick.x}
                        y={padding.top + innerHeight + 28}
                        textAnchor="middle"
                        className="text-[9px] fill-slate-400 font-mono"
                      >
                        {subLabel}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Highlighted Small Anomaly Markers (Rendered cleanly without large clutter) */}
              {anomalyMarkers.map((p, i) => {
                const anom = p.anomaly!;
                const isCritical = anom.severity === 'critical';
                const isHigh = anom.severity === 'high';
                const fillColor = isCritical ? '#dc2626' : isHigh ? '#ea580c' : '#d97706';

                return (
                  <g key={`anom-${i}`}>
                    {/* Clean small ring */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill={fillColor}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:scale-150 transition-transform duration-150"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAnomaly(anom);
                      }}
                    />
                  </g>
                );
              })}

              {/* Active Scrubber Crosshair & Focus Dot */}
              {activeHoverPoint && (
                <g>
                  {/* Vertical dashed guideline */}
                  <line
                    x1={activeHoverPoint.x}
                    y1={padding.top}
                    x2={activeHoverPoint.x}
                    y2={padding.top + innerHeight}
                    stroke="#64748b"
                    strokeWidth="1.25"
                    strokeDasharray="3 3"
                  />

                  {/* Scrubber bead on load line */}
                  <circle
                    cx={activeHoverPoint.x}
                    cy={activeHoverPoint.y}
                    r="5"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="shadow-sm"
                  />

                  {/* If hovered point is an anomaly, render pulsing aura */}
                  {activeHoverPoint.anomaly && (
                    <circle
                      cx={activeHoverPoint.x}
                      cy={activeHoverPoint.y}
                      r="8"
                      fill="none"
                      stroke={
                        activeHoverPoint.anomaly.severity === 'critical' ? '#dc2626' : '#ea580c'
                      }
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              )}
            </svg>

            {/* Smart Interactive Tooltip */}
            {activeHoverPoint && (
              <div
                className="absolute z-20 pointer-events-none bg-slate-900/95 text-white p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 backdrop-blur-xs border border-slate-700/80 -translate-x-1/2 -translate-y-full -mt-3 min-w-[240px] max-w-[320px] transition-all duration-75"
                style={{
                  left: `${Math.max(16, Math.min(84, (activeHoverPoint.x / width) * 100))}%`,
                  top: `${Math.max(15, (activeHoverPoint.y / height) * 100)}%`,
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                  <span className="font-semibold text-slate-200">
                    {new Date(activeHoverPoint.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="text-[10px] text-blue-300 font-mono font-semibold">
                    {activeHoverPoint.isAggregated ? 'Daily Average' : 'Hourly Interval'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-400">Electricity Demand:</span>
                  <span className="font-extrabold text-blue-300 font-mono text-sm">
                    {activeHoverPoint.consumptionKwh.toFixed(1)} kWh
                  </span>
                </div>

                {activeHoverPoint.anomaly ? (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        {activeHoverPoint.anomaly.severity.toUpperCase()} ANOMALY
                      </span>
                      <span className="font-mono text-xs text-red-400 font-bold">
                        {formatSignedMadScore(activeHoverPoint.anomaly.explanation.robust_z_score)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 leading-snug">
                      Expected normal baseline was ~
                      <strong className="text-white">
                        {activeHoverPoint.anomaly.explanation.baseline_median_kwh.toFixed(1)} kWh
                      </strong>
                      .
                    </div>

                    <p className="text-[10px] text-amber-200 italic pt-0.5">
                      Click marker or list below to open full investigation card &rarr;
                    </p>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-400 flex items-center gap-1 pt-0.5">
                    <span>✓ Within normal baseline range</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clean Legend & Instructions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-blue-600 inline-block rounded" />
            <span className="font-medium text-slate-700">Electricity Load (kWh)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
            <span>Critical Anomaly</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
            <span>High/Moderate Anomaly</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Move mouse across chart to scrub intervals. Click any anomaly marker to inspect.</span>
        </div>
      </div>
    </div>
  );
};
