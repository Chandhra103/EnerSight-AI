/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { detectEnergyAnomalies } from '../../src/utils/anomalyDetection.ts';
import { validateEnergyDataset } from '../../src/utils/validation.ts';
import { EnergyReading, ProvenanceInfo } from '../../src/types/energy.ts';

const logger = new Logger({
  serviceName: 'enersight-anomaly-analyzer',
});

interface BatchAnalysisRequestBody {
  readings: EnergyReading[];
  provenance?: ProvenanceInfo;
  options?: {
    robustZThreshold?: number;
    minSamplesPerBin?: number;
    tariffUsdPerKwh?: number;
    highOutlierThresholdKwh?: number;
  };
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
};

/**
 * AWS Lambda handler for EnerSight AI Anomaly Batch Analysis.
 * Implements standard AWS API Gateway proxy integration.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context?: Context
): Promise<APIGatewayProxyResult> {
  // Append request context for structured logging
  logger.info('Processing EnerSight energy anomaly batch request', {
    httpMethod: event.httpMethod,
    path: event.path,
    requestId: context?.awsRequestId || 'local-test-request',
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'CORS OK' }),
    };
  }

  // Enforce POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Method Not Allowed',
        message: `Expected POST, received ${event.httpMethod}`,
      }),
    };
  }

  // Validate body presence
  if (!event.body || event.body.trim().length === 0) {
    logger.warn('Rejected request: Empty event body');
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body must not be empty. JSON payload required.',
      }),
    };
  }

  // Parse JSON
  let body: BatchAnalysisRequestBody;
  try {
    body = JSON.parse(event.body);
  } catch (err: unknown) {
    logger.error('Failed to parse JSON body', { error: err });
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Malformed JSON payload in request body.',
      }),
    };
  }

  // Validate readings array
  if (!body.readings || !Array.isArray(body.readings)) {
    logger.warn('Rejected request: readings field missing or not an array');
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'Request body must include a "readings" array.',
      }),
    };
  }

  if (body.readings.length === 0) {
    logger.warn('Rejected request: readings array is empty');
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Bad Request',
        message: 'The "readings" array cannot be empty. Provide interval meter records to analyze.',
      }),
    };
  }

  // Step 1: Run Ingestion Validation Rules (V1 - V6)
  const validationRes = validateEnergyDataset(
    body.readings,
    body.provenance,
    body.options?.highOutlierThresholdKwh ?? 2000.0
  );

  logger.info('Data validation completed', {
    evaluated: validationRes.report.total_records_evaluated,
    accepted: validationRes.report.accepted_records_count,
    rejected: validationRes.report.rejected_records_count,
    provenance: validationRes.report.verified_provenance_type,
  });

  // If fatal validation errors rejected all records
  if (validationRes.sanitizedReadings.length === 0) {
    return {
      statusCode: 422,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Unprocessable Entity',
        message: 'All submitted records failed data validation checks.',
        validation_report: validationRes.report,
      }),
    };
  }

  // Step 2: Run Explainable Anomaly Detection Engine (Median / MAD)
  const tariffRate = body.options?.tariffUsdPerKwh ?? 0.14;
  const analysisResult = detectEnergyAnomalies(validationRes.sanitizedReadings, {
    robustZThreshold: body.options?.robustZThreshold ?? 3.0,
    minSamplesPerBin: body.options?.minSamplesPerBin ?? 3,
    tariffUsdPerKwh: tariffRate,
  });

  logger.info('Anomaly analysis completed', {
    totalEvaluated: analysisResult.totalEvaluated,
    totalFlagged: analysisResult.totalFlaggedCount,
    excessKwh: analysisResult.totalExcessKwh,
    costExposureUsd: analysisResult.totalPotentialCostExposureUsd,
  });

  // Return success payload
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      status: 'success',
      engine: 'AWS-Lambda-EnerSight-Analyzer',
      validation: {
        total_submitted: body.readings.length,
        total_accepted: validationRes.sanitizedReadings.length,
        total_rejected: validationRes.report.rejected_records_count,
        provenance_type: validationRes.report.verified_provenance_type,
        warnings_count: validationRes.report.warnings.length,
        gaps_detected_count: validationRes.report.detected_gaps.length,
      },
      analysis: {
        readings_evaluated: analysisResult.totalEvaluated,
        anomalies_flagged_count: analysisResult.totalFlaggedCount,
        anomaly_rate_percent: Number(
          ((analysisResult.totalFlaggedCount / Math.max(1, analysisResult.totalEvaluated)) * 100).toFixed(2)
        ),
        estimated_potential_excess_kwh: analysisResult.totalExcessKwh,
        estimated_potential_cost_exposure_usd: analysisResult.totalPotentialCostExposureUsd,
        tariff_applied_usd_kwh: tariffRate,
      },
      anomalies: analysisResult.anomalies,
      timestamp: new Date().toISOString(),
    }),
  };
}
