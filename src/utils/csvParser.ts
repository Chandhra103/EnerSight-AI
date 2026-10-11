/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BuildingMetadata, BuildingPrimaryUse, EnergyReading } from '../types/energy.ts';

export interface CsvParseResult {
  readings: EnergyReading[];
  buildings: BuildingMetadata[];
  parseErrors: string[];
}

/**
 * Splits a CSV line taking quoted fields into account.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalizes column header names for automatic mapping.
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses raw CSV text into EnergyReading[] and BuildingMetadata[] in the browser.
 */
export function parseEnergyCsv(csvText: string): CsvParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parseErrors: string[] = [];

  if (lines.length < 2) {
    return {
      readings: [],
      buildings: [],
      parseErrors: ['CSV file is empty or does not contain header and data rows.'],
    };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const normHeaders = rawHeaders.map(normalizeHeader);

  // Column index identification
  let tsIdx = -1;
  let kwhIdx = -1;
  let bldgIdx = -1;
  let useIdx = -1;
  let sqftIdx = -1;

  for (let i = 0; i < normHeaders.length; i++) {
    const h = normHeaders[i];
    if (['timestamp', 'datetime', 'date', 'time', 'readtime', 'isodate'].includes(h)) {
      tsIdx = i;
    } else if (
      ['consumptionkwh', 'kwh', 'energykwh', 'usagekwh', 'reading', 'value', 'consumption', 'electric'].includes(h)
    ) {
      kwhIdx = i;
    } else if (['buildingid', 'bldgid', 'meterid', 'siteid', 'building', 'facilityid'].includes(h)) {
      bldgIdx = i;
    } else if (['primaryuse', 'primaryspaceusage', 'buildingtype', 'usetype', 'use'].includes(h)) {
      useIdx = i;
    } else if (['floorareasqft', 'sqft', 'grossfloorarea', 'areasqft', 'area'].includes(h)) {
      sqftIdx = i;
    }
  }

  if (tsIdx === -1) {
    parseErrors.push('Missing required timestamp column (e.g., "timestamp", "datetime", "date").');
  }
  if (kwhIdx === -1) {
    parseErrors.push('Missing required energy column (e.g., "consumption_kwh", "kwh", "reading").');
  }

  if (parseErrors.length > 0) {
    return { readings: [], buildings: [], parseErrors };
  }

  const readings: EnergyReading[] = [];
  const buildingsMap = new Map<string, BuildingMetadata>();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length <= Math.max(tsIdx, kwhIdx)) {
      continue;
    }

    const rawTs = row[tsIdx];
    const rawKwh = row[kwhIdx];
    const bldgId = bldgIdx !== -1 && row[bldgIdx] ? row[bldgIdx] : 'UPLOADED_BLDG_01';
    const primaryUseRaw = useIdx !== -1 && row[useIdx] ? row[useIdx] : 'Commercial';
    const sqftRaw = sqftIdx !== -1 && row[sqftIdx] ? parseFloat(row[sqftIdx]) : undefined;

    const val = parseFloat(rawKwh);

    // Normalize timestamp to ISO string if possible
    let isoTs = rawTs;
    if (rawTs) {
      // If timestamp lacks 'T' or offset, try standard parse
      if (!rawTs.includes('T')) {
        const d = new Date(rawTs);
        if (!isNaN(d.getTime())) {
          isoTs = d.toISOString();
        }
      }
    }

    const readingId = `${bldgId}_row_${i}`;
    readings.push({
      reading_id: readingId,
      building_id: bldgId,
      timestamp: isoTs,
      original_timestamp: rawTs,
      consumption_kwh: isNaN(val) ? 0 : val,
      interval_minutes: 60,
    });

    if (!buildingsMap.has(bldgId)) {
      const allowedUses: BuildingPrimaryUse[] = [
        'Education',
        'Office',
        'Healthcare',
        'Laboratory',
        'Residential',
        'Commercial',
        'Other',
      ];
      const matchedUse =
        allowedUses.find((u) => u.toLowerCase() === primaryUseRaw.toLowerCase()) || 'Commercial';

      buildingsMap.set(bldgId, {
        building_id: bldgId,
        display_name: `Uploaded Facility (${bldgId})`,
        organization_id: 'org_user_upload',
        primary_use: matchedUse,
        floor_area_sqft: sqftRaw && !isNaN(sqftRaw) ? sqftRaw : 50000,
        meter_type: 'main_electric',
        default_tariff_usd_kwh: 0.14,
      });
    }
  }

  return {
    readings,
    buildings: Array.from(buildingsMap.values()),
    parseErrors,
  };
}
