# EnerSight AI

> **"See Energy Differently. Waste Less. Save More."**  
> *Developed for Environmental Hacks 2026 — Waste & Energy Track*

EnerSight AI is a software-only energy analytics and explainable anomaly detection platform designed for multi-facility organizations (campuses, hospitals, corporate real estate, and municipal portfolios). It turns interval electricity meter data into auditable operational investigations, identifying potential electricity waste and cost reduction opportunities without requiring physical IoT sensors or paid cloud infrastructure.

---

## 1. Environmental Problem & Mission

Commercial and institutional facilities consume substantial electricity during unoccupied or off-hours due to equipment schedule overrides, stuck ventilation dampers, simultaneous chiller staging, and baseload drift. Facility managers and sustainability teams often face:
* **Data Opacity:** Hundreds of thousands of raw interval meter records are difficult to audit manually.
* **Black-Box Skepticism:** Proprietary anomaly tools flag scores without showing baselines, leading to false-positive fatigue.
* **The "Anomaly ≠ Waste" Confusion:** Not every spike is wasteful (some represent normal scheduled events). True waste requires an auditable investigative workflow.

EnerSight AI addresses this with **transparent, robust statistical baselining (Median / MAD)** and a strict **dual-ledger accounting approach** that never conflates theoretical potential savings with verified reductions.

---

## 2. Core Application Features

The application provides five fully interactive, client-side views:

1. **Executive Dashboard (`DashboardView`):**
   * Real-time portfolio KPIs: Total Energy Consumed (kWh), Estimated Utility Cost ($), Active Flagged Anomalies, and Potential vs. Verified Savings.
   * Interactive SVG time-series chart with date scrubbing (`Full Window`, `14D`, `7D`, `24H`), hover tooltips, and clickable anomaly markers.
   * Facility portfolio dropdown filter and quick-investigation table.
2. **Facility Intelligence (`BuildingsView`):**
   * Multi-facility benchmarking grid and comparative table.
   * Calculates Energy Use Intensity proxy ($\text{EUI} = \text{kWh} / \text{sq.ft}$) for peer comparisons.
   * Building-specific drill-down into consumption and active alert counts.
3. **Explainable Anomaly Triage (`AnomaliesView`):**
   * Multi-criteria filtering by severity (`Critical`, `High`, `Medium`, `Low`), fault type, and triage status.
   * Modal investigation playbook (`AnomalyDetailModal`) revealing exact mathematical evidence: observed reading, expected baseline median, MAD value, and robust Modified Z-score.
   * Field inspection standard operating procedures (SOPs) and status workflows (`Flagged` &rarr; `Investigating` &rarr; `Action Taken` &rarr; `Resolved` &rarr; `Dismissed`).
4. **Data Ingestion Station (`DataImportView`):**
   * Client-side CSV upload and token parser with automatic column mapping.
   * Automated Ingestion Audit executing Rules **V1–V6** (ISO timestamp parsing, non-negative bounds, deduplication, non-destructive outlier review, and gap detection).
   * One-click demo CSV template loader and **"Load into Active Workspace"** commit button.
5. **Impact & Verified Savings (`ImpactView`):**
   * Strict dual-ledger accounting separating theoretical exposure from verified reductions.
   * Audit log of maintenance actions taken with field notes.
   * Indicative carbon avoidance proxy (~0.385 kg CO₂e / kWh U.S. EPA eGRID average) and JSON audit report export.

---

## 3. Architecture Overview

```
EnerSight AI Architecture
├── Web Client (100% In-Browser / $0 Infrastructure)
│   ├── React 19 + TypeScript + Tailwind CSS (Vite Bundler)
│   ├── Interactive SVG Time-Series Chart (Zero-dependency SVG)
│   ├── Client Ingestion Engine (src/utils/csvParser.ts & validation.ts)
│   └── Statistical Baseline Engine (src/utils/anomalyDetection.ts)
│
├── Bundled Data Assets (public/data/)
│   ├── sample_bdg2.json         <-- Real campus data (4,392 hourly readings)
│   └── benchmark_faults.json    <-- Synthetic diagnostic suite (336 hourly readings)
│
└── AWS Serverless Microservice (serverless/ & template.yaml)
    ├── AWS SAM Specification (`template.yaml`)
    ├── AWS Lambda Handler (`serverless/handlers/analyze.ts`)
    ├── AWS Lambda Powertools (`@aws-lambda-powertools/logger`)
    └── Offline Test Harness (`scripts/test_serverless_handler.ts`)
```

### Anomaly Detection Methodology
* Contextual time binning (Adaptive Day-Type or Day-of-Week $\times$ Hour-of-Day).
* Robust Median baseline ($\tilde{M}$) and safe Median Absolute Deviation ($\text{MAD}_{\text{safe}} = \max(\text{MAD}, 0.05 \cdot \tilde{M})$) to prevent division by zero.
* Robust Modified Z-Score: $M_i = \frac{0.6745 \cdot (X_i - \tilde{M})}{\text{MAD}_{\text{safe}}}$. Flags anomalies when $M_i > 3.0$.

---

## 4. Installation & Local Setup

### Prerequisites
* **Node.js:** v18.0.0 or later (v20+ recommended)
* **npm:** v9.0.0 or later

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Run the Web Application
Start the local development server on port 3000:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
```

### Lint & Type Check
```bash
npm run lint
```

---

## 5. Automated Test Suites

EnerSight AI includes two test suites (52 passing test assertions) that execute offline without cloud credentials or network dependencies:

### 1. Data Ingestion & Anomaly Validation Suite (32 Tests)
Tests rules V1–V6, edge cases (negatives, duplicate collisions, gaps, unverified provenance), and mathematical detection against BDG2 and synthetic data:
```bash
npx tsx scripts/run_validation_tests.ts
```

### 2. AWS Serverless Handler Offline Test Harness (20 Tests)
Tests the AWS Lambda handler with mock API Gateway proxy events, payload validation, CORS handling, and AWS Lambda Powertools structured logging:
```bash
npx tsx scripts/test_serverless_handler.ts
```

---

## 6. AWS SAM Specification & Serverless Testing

The project includes an **AWS Serverless Application Model (SAM)** template (`template.yaml`) defining the `EnerSightAnomalyAnalyzerFunction` microservice running Node.js 20.x on AWS Lambda with API Gateway HTTP events.

### Verification Notice:
* The Lambda handler and Powertools logger have been **verified via the local Node.js test harness** (`scripts/test_serverless_handler.ts`).
* **Execution via `sam local invoke` or Docker Desktop has NOT been performed in this cloud sandbox environment** because Docker is not installed in this container.

### Workstation SAM CLI Testing (Requires Docker Desktop):
On a local developer machine with [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and Docker Desktop installed:

1. **Validate the SAM Template:**
   ```bash
   sam validate
   ```
2. **Invoke the Function with the Synthetic Test Event:**
   ```bash
   sam local invoke EnerSightAnomalyAnalyzerFunction -e serverless/events/test_event_valid.json
   ```
3. **Start Local Emulated API Gateway:**
   ```bash
   sam local start-api --port 3001
   ```
   *Test via curl:*
   ```bash
   curl -X POST http://127.0.0.1:3001/api/v1/analyze \
     -H "Content-Type: application/json" \
     -d @serverless/events/test_event_valid.json
   ```

---

## 7. Data Sources, Attributions & Licenses

### 1. Real Campus Dataset (`public/data/sample_bdg2.json`)
* **Source:** Building Data Genome Project 2 (BDG2)
* **Citation:** Miller, C., Kathuria, A., Arjunan, P. et al. *"The Building Data Genome II, a public dataset of 3,053 energy meters from 1,636 non-residential buildings."* **Nature Scientific Data** 7, 368 (2020). DOI: [10.1038/s41597-020-00712-x](https://doi.org/10.1038/s41597-020-00712-x).
* **License:** **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
* **Buildings Included:** 3 educational/office buildings from the `Panther` site (`Panther_education_Jerome`, `Panther_education_Vincent`, `Panther_office_Karla`).
* **Temporal Window:** April 1, 2017 to May 31, 2017 (61 days / 1,464 continuous hours per building, 4,392 total readings, 0 nulls, 100% complete).
* **Units & Timezone:** kWh per 1-hour interval; `US/Eastern` EDT (offset `-04:00`).

### 2. Synthetic Diagnostic Benchmark (`public/data/benchmark_faults.json`)
* **Origin:** Authored for EnerSight AI diagnostic validation (`is_synthetic: true`).
* **Scope:** 336 hourly readings (14 days: May 1 to May 14, 2026) for building `SIM_BLDG_01` (35,000 sq.ft Office).
* **Documented Injected Faults:**
  1. *Fault 1:* High overnight baseload (May 7 22:00 – May 8 06:00, 115 kWh vs. 30 kWh baseline).
  2. *Fault 2:* Midday peak surge (May 5 14:00, 295 kWh vs. 145 kWh baseline).
  3. *Fault 3:* Persistent baseload drift (May 11–14 off-hours creep from +16 to +64 kWh).

---

## 8. Financial Accounting: Estimated vs. Verified Savings

EnerSight AI enforces strict mathematical and linguistic distinctions between two separate metrics:

| Metric | Accounting Definition | Status in EnerSight AI |
| :--- | :--- | :--- |
| **Estimated Potential Savings** | Calculated as $\sum (\text{Excess kWh} \times \text{Tariff Rate})$. Represents financial exposure if every flagged baseline deviation was fully avoidable waste. | **Theoretical / Exploratory Only.** Never presented as confirmed real-world savings. Dependent on transparent illustrative tariff ($0.14/kWh default, user-configurable). |
| **Verified Measured Savings** | Calculated strictly from user-logged maintenance actions where post-intervention reduction was confirmed by subsequent meter records. | **Empirical / Audited.** Starts at **$0.00** by default. Increments only when an authorized operator documents a physical fix. |

---

## 9. Current Limitations & Project Status

* **Hackathon Compliance Note:** AWS Lambda Powertools and SAM specification are configured and tested offline, but hackathon organizers have not confirmed whether local-only usage qualifies without an active AWS cloud deployment.
* **Weather Regression:** Currently utilizes contextual time-of-week binning. Future iterations could incorporate degree-day normalization (HDD/CDD).
* **AI Tooling Acknowledgement:** Development, architecture discovery, and scaffolding were assisted by Google AI Studio Build and Gemini models.
* **License:** Source code is licensed under the Apache License 2.0. Bundled BDG2 data is used under CC BY 4.0.
