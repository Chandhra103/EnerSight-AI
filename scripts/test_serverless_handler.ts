/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { handler } from '../serverless/handlers/analyze.ts';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock AWS Lambda Context
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'EnerSightAnomalyAnalyzerFunction',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:EnerSightAnomalyAnalyzerFunction',
  memoryLimitInMB: '256',
  awsRequestId: 'local-test-req-001',
  logGroupName: '/aws/lambda/EnerSightAnomalyAnalyzerFunction',
  logStreamName: '2026/10/10/[$LATEST]mockstream',
  getRemainingTimeInMillis: () => 14500,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

async function runServerlessTestSuite() {
  console.log('================================================================');
  console.log('   ENERSIGHT AI: AWS SERVERLESS HANDLER LOCAL TEST HARNESS      ');
  console.log('   (Offline Simulation - Zero Cloud Charges / Zero Credentials) ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: OPTIONS CORS Preflight
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: CORS Preflight Handler ---');
  const optionsEvent: APIGatewayProxyEvent = {
    httpMethod: 'OPTIONS',
    path: '/api/v1/analyze',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    body: null,
    isBase64Encoded: false,
  };
  const optionsRes = await handler(optionsEvent, mockContext);
  assert(optionsRes.statusCode === 200, 'OPTIONS returns 200 OK');
  assert(
    optionsRes.headers?.['Access-Control-Allow-Origin'] === '*',
    'CORS header Access-Control-Allow-Origin is "*"'
  );
  assert(
    optionsRes.headers?.['Access-Control-Allow-Methods'] === 'OPTIONS,POST',
    'CORS header Access-Control-Allow-Methods contains "OPTIONS,POST"'
  );

  // --------------------------------------------------------------------------
  // TEST 2: Invalid HTTP Method (GET -> 405)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: HTTP Method Enforcement ---');
  const getEvent = { ...optionsEvent, httpMethod: 'GET' };
  const getRes = await handler(getEvent, mockContext);
  assert(getRes.statusCode === 405, 'GET request rejected with 405 Method Not Allowed');

  // --------------------------------------------------------------------------
  // TEST 3: Malformed JSON Body (400 Bad Request)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Malformed JSON Input ---');
  const malformedEventStr = fs.readFileSync(
    path.resolve(process.cwd(), 'serverless/events/test_event_malformed.json'),
    'utf8'
  );
  const malformedEvent: APIGatewayProxyEvent = {
    ...optionsEvent,
    ...JSON.parse(malformedEventStr),
  };
  const malformedRes = await handler(malformedEvent, mockContext);
  assert(malformedRes.statusCode === 400, 'Malformed JSON returns 400 Bad Request');
  const malformedBody = JSON.parse(malformedRes.body);
  assert(
    malformedBody.message.includes('Malformed JSON payload'),
    'Descriptive error message returned for bad JSON'
  );

  // --------------------------------------------------------------------------
  // TEST 4: Empty Readings Array (400 Bad Request)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Empty Readings Array ---');
  const emptyEventStr = fs.readFileSync(
    path.resolve(process.cwd(), 'serverless/events/test_event_empty.json'),
    'utf8'
  );
  const emptyEvent: APIGatewayProxyEvent = {
    ...optionsEvent,
    ...JSON.parse(emptyEventStr),
  };
  const emptyRes = await handler(emptyEvent, mockContext);
  assert(emptyRes.statusCode === 400, 'Empty readings array returns 400 Bad Request');
  const emptyBody = JSON.parse(emptyRes.body);
  assert(
    emptyBody.message.includes('cannot be empty'),
    'Descriptive error message for empty readings'
  );

  // --------------------------------------------------------------------------
  // TEST 5: Missing Readings Key (400 Bad Request)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Missing Required Schema Key ---');
  const missingKeyEvent: APIGatewayProxyEvent = {
    ...optionsEvent,
    httpMethod: 'POST',
    body: JSON.stringify({ some_other_key: 123 }),
  };
  const missingKeyRes = await handler(missingKeyEvent, mockContext);
  assert(missingKeyRes.statusCode === 400, 'Missing "readings" key returns 400 Bad Request');

  // --------------------------------------------------------------------------
  // TEST 6: Valid Batch Payload (48-hour Synthetic Sample)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Valid Batch Event Invocation ---');
  const validEventStr = fs.readFileSync(
    path.resolve(process.cwd(), 'serverless/events/test_event_valid.json'),
    'utf8'
  );
  const validEvent: APIGatewayProxyEvent = {
    ...optionsEvent,
    ...JSON.parse(validEventStr),
  };
  const validRes = await handler(validEvent, mockContext);
  assert(validRes.statusCode === 200, 'Valid payload returns 200 OK');
  const validBody = JSON.parse(validRes.body);
  assert(validBody.status === 'success', 'Response status is "success"');
  assert(
    validBody.engine === 'AWS-Lambda-EnerSight-Analyzer',
    'Engine identified as AWS-Lambda-EnerSight-Analyzer'
  );
  assert(validBody.validation.total_accepted === 48, 'Validation accepted all 48 readings');
  assert(typeof validBody.analysis.anomalies_flagged_count === 'number', 'Anomalies count is a number');
  console.log(`  Readings Evaluated: ${validBody.analysis.readings_evaluated}`);
  console.log(`  Anomalies Flagged: ${validBody.analysis.anomalies_flagged_count}`);
  console.log(`  Estimated Excess kWh: ${validBody.analysis.estimated_potential_excess_kwh} kWh`);

  // --------------------------------------------------------------------------
  // TEST 7: Complete 336-Hour Synthetic Benchmark Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Full 336-Hour Benchmark Anomaly Catch Rate ---');
  const benchRaw = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data/benchmark_faults.json'), 'utf8')
  );
  const fullBenchEvent: APIGatewayProxyEvent = {
    ...optionsEvent,
    httpMethod: 'POST',
    body: JSON.stringify({
      readings: benchRaw.readings,
      provenance: benchRaw.provenance,
      options: {
        robustZThreshold: 3.0,
        minSamplesPerBin: 3,
        tariffUsdPerKwh: 0.14,
      },
    }),
  };
  const fullBenchRes = await handler(fullBenchEvent, mockContext);
  assert(fullBenchRes.statusCode === 200, 'Full benchmark returned 200 OK');
  const fullBody = JSON.parse(fullBenchRes.body);
  assert(fullBody.validation.total_accepted === 336, 'All 336 benchmark readings accepted');

  // Verify that Fault 2 (Sudden Midday Surge on May 5 14:00) is flagged by serverless handler
  const spikeHit = fullBody.anomalies.find((a: any) => a.timestamp.startsWith('2026-05-05T14:00'));
  assert(spikeHit !== undefined, 'Fault 2 (Sudden Midday Spike) flagged by serverless handler');
  assert(spikeHit?.explanation.observed_kwh === 295, 'Spike observed value verified as 295.0 kWh');
  assert(spikeHit?.explanation.robust_z_score > 6.0, 'Spike robust Z-score exceeds +6.0 MAD');

  // Verify that Fault 1 (Overnight Override May 7 22:00 to May 8 06:00) is flagged
  const overnightHits = fullBody.anomalies.filter((a: any) =>
    a.timestamp.startsWith('2026-05-07T22') ||
    a.timestamp.startsWith('2026-05-07T23') ||
    a.timestamp.startsWith('2026-05-08T0')
  );
  assert(overnightHits.length >= 8, `Fault 1 (Overnight Override) flagged across 8+ hours (Found: ${overnightHits.length})`);

  console.log('\n================================================================');
  console.log(`SERVERLESS TEST HARNESS RESULTS: ${passed} passed, ${failed} failed.`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runServerlessTestSuite();
