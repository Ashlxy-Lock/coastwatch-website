"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { MODEL_META, predictRisk, type EnvironmentReading } from "./model";

const LOCATION = {
  name: "Great Yarmouth, England",
  latitude: 52.60831,
  longitude: 1.73052,
} as const;

const EMPTY_READING: EnvironmentReading = {
  airTemperature: null,
  humidity: null,
  rain: null,
  windSpeed: null,
  windGusts: null,
  pressureMsl: null,
  windDirection: null,
  waveHeight: null,
  wavePeriod: null,
  waterTemperature: null,
  seaLevel: null,
  currentVelocity: null,
  currentDirection: null,
  weatherCode: null,
  tideTrend: "unknown",
};

const FEATURE_LABELS: Record<string, string> = {
  day_of_year_cos: "Seasonal cycle",
  temperature_2m_c: "Air temperature",
  sea_level_height_msl_m: "Sea-level height",
  relative_humidity_2m_percent: "Relative humidity",
  wind_speed_10m_kmh: "Wind speed",
  wind_gusts_10m_kmh: "Wind gusts",
  ocean_current_velocity_kmh: "Ocean current",
  rain_mm: "Rainfall",
};

const GEOGRAPHY = [
  { code: "LAT", value: "52.60831° N", label: "Latitude" },
  { code: "LON", value: "1.73052° E", label: "Longitude" },
  { code: "ELV", value: "6 m", label: "Town elevation" },
  { code: "SEA", value: "North Sea", label: "Adjacent sea" },
  { code: "EST", value: "River Yare", label: "Estuary setting" },
  { code: "TZN", value: "Europe/London", label: "Local timezone" },
  { code: "WTH", value: "52.6186, 1.6791", label: "Weather grid cell" },
  { code: "MAR", value: "52.6250, 1.8750", label: "Marine grid cell" },
] as const;

type DataState = "loading" | "live" | "unavailable";
type ApiPayload = {
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown>;
};

const [[trueNegative, falsePositive], [falseNegative, truePositive]] = MODEL_META.confusionMatrix;
const metrics = MODEL_META.metrics;

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function maxCell(matrix: readonly (readonly number[])[]) {
  return Math.max(...matrix.flat());
}

function tideTrend(hourly?: Record<string, unknown>): EnvironmentReading["tideTrend"] {
  const levels = hourly?.sea_level_height_msl;
  if (!Array.isArray(levels)) return "unknown";
  const valid = levels.map(numeric).filter((value): value is number => value !== null);
  if (valid.length < 2) return "unknown";
  const change = valid.at(-1)! - valid[0];
  if (Math.abs(change) < 0.02) return "steady";
  return change > 0 ? "rising" : "falling";
}

async function fetchEnvironment(signal: AbortSignal) {
  const place = `latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&timezone=GMT`;
  const weatherVariables = [
    "temperature_2m",
    "relative_humidity_2m",
    "rain",
    "weather_code",
    "pressure_msl",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
  ].join(",");
  const marineVariables = [
    "wave_height",
    "wave_period",
    "sea_surface_temperature",
    "sea_level_height_msl",
    "ocean_current_velocity",
    "ocean_current_direction",
  ].join(",");
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${place}&current=${weatherVariables}`;
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?${place}&current=${marineVariables}&hourly=sea_level_height_msl&past_hours=1&forecast_hours=2`;
  const [weatherResponse, marineResponse] = await Promise.all([
    fetch(weatherUrl, { signal, cache: "no-store" }),
    fetch(marineUrl, { signal, cache: "no-store" }),
  ]);

  if (!weatherResponse.ok || !marineResponse.ok) {
    throw new Error("Open-Meteo request failed");
  }

  const [weather, marine] = await Promise.all([
    weatherResponse.json() as Promise<ApiPayload>,
    marineResponse.json() as Promise<ApiPayload>,
  ]);
  const weatherNow = weather.current ?? {};
  const marineNow = marine.current ?? {};
  const reading: EnvironmentReading = {
    airTemperature: numeric(weatherNow.temperature_2m),
    humidity: numeric(weatherNow.relative_humidity_2m),
    rain: numeric(weatherNow.rain),
    windSpeed: numeric(weatherNow.wind_speed_10m),
    windGusts: numeric(weatherNow.wind_gusts_10m),
    pressureMsl: numeric(weatherNow.pressure_msl),
    windDirection: numeric(weatherNow.wind_direction_10m),
    waveHeight: numeric(marineNow.wave_height),
    wavePeriod: numeric(marineNow.wave_period),
    waterTemperature: numeric(marineNow.sea_surface_temperature),
    seaLevel: numeric(marineNow.sea_level_height_msl),
    currentVelocity: numeric(marineNow.ocean_current_velocity),
    currentDirection: numeric(marineNow.ocean_current_direction),
    weatherCode: numeric(weatherNow.weather_code),
    tideTrend: tideTrend(marine.hourly),
  };
  const required = [
    reading.airTemperature,
    reading.humidity,
    reading.rain,
    reading.windSpeed,
    reading.windGusts,
    reading.pressureMsl,
    reading.waveHeight,
    reading.wavePeriod,
    reading.waterTemperature,
    reading.seaLevel,
    reading.currentVelocity,
  ];
  if (required.some((value) => value === null)) {
    throw new Error("Open-Meteo returned an incomplete current observation");
  }

  const apiTime = typeof weatherNow.time === "string" ? weatherNow.time : null;
  return {
    reading,
    observedAt: apiTime ? new Date(`${apiTime}Z`) : new Date(),
  };
}

function value(value: number | null, digits = 1) {
  return value === null ? "—" : value.toFixed(digits);
}

export default function Home() {
  const [reading, setReading] = useState<EnvironmentReading>(EMPTY_READING);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [observedAt, setObservedAt] = useState<Date | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  const refresh = useCallback(() => {
    setDataState("loading");
    setRequestNumber((number) => number + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    let active = true;
    fetchEnvironment(controller.signal)
      .then((result) => {
        if (!active) return;
        setReading(result.reading);
        setObservedAt(result.observedAt);
        setDataState("live");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (controller.signal.aborted && error instanceof DOMException && error.name === "AbortError") {
          setDataState("unavailable");
          return;
        }
        if (!controller.signal.aborted) setDataState("unavailable");
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [requestNumber]);

  const prediction = useMemo(
    () => dataState === "live" ? predictRisk(reading, observedAt ?? new Date()) : null,
    [dataState, observedAt, reading],
  );
  const safeProbability = prediction ? 1 - prediction.unsafeProbability : null;
  const unsafeProbability = prediction?.unsafeProbability ?? null;
  const status = prediction?.name ?? null;
  const statusLabel = status ? status.toUpperCase() : dataState === "loading" ? "LOADING" : "UNAVAILABLE";
  const dialValue = safeProbability === null ? 0 : safeProbability * 100;
  const observedLabel = observedAt?.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }) ?? "—";
  const currentRows = [
    ["Air temperature", value(reading.airTemperature), "°C"],
    ["Relative humidity", value(reading.humidity, 0), "%"],
    ["Rainfall", value(reading.rain, 2), "mm"],
    ["Wind speed", value(reading.windSpeed), "km/h"],
    ["Wind gusts", value(reading.windGusts), "km/h"],
    ["Pressure MSL", value(reading.pressureMsl), "hPa"],
    ["Wave height", value(reading.waveHeight, 2), "m"],
    ["Wave period", value(reading.wavePeriod), "s"],
    ["Sea-level height MSL", value(reading.seaLevel, 2), "m"],
    ["Sea-surface temperature", value(reading.waterTemperature), "°C"],
    ["Ocean current", value(reading.currentVelocity, 2), "km/h"],
  ];

  return (
    <main className="app-shell" lang="en-GB">
      <header className="topbar simple-topbar">
        <a className="brand" href="#project" aria-label="CoastWatch study home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>COASTWATCH</strong><small>GREAT YARMOUTH · DATA STUDY</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#project">Project</a>
          <a href="#live">Live</a>
          <a href="#evaluation">Evaluation</a>
          <a href="#data">Data</a>
        </nav>
        <div className="top-actions">
          <a className="admin-access" href="/admin/login"><span aria-hidden="true">◇</span>CONSOLE</a>
        </div>
      </header>

      <section className="study-hero section" id="project">
        <div className="study-title">
          <p className="kicker"><span>01</span>COASTAL DATA RESEARCH</p>
          <h1>The Study of coastal risk related data in Great Yarmouth, England.</h1>
        </div>

        <div className="geography-heading">
          <span>Coastline of Great Yarmouth</span>
        </div>
        <div className="geography-grid">
          {GEOGRAPHY.map((item) => (
            <article key={item.code}>
              <span>{item.code}</span>
              <strong>{item.value}</strong>
              <small>{item.label}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="live-dashboard section" id="live">
        <div className="section-heading live-heading">
          <div>
            <p className="kicker"><span>02</span>LIVE OPEN-METEO MODEL</p>
            <h2>Current conditions,<em>current model result.</em></h2>
          </div>
          <p>Open-Meteo weather and marine readings for {LOCATION.name}, evaluated by the trained Logistic Regression model.</p>
        </div>

        <div className="dashboard-grid">
          <article className={`risk-card ${status === "unsafe" ? "risk-unsafe" : ""}`}>
            <div className="card-topline">
              <div><span>CURRENT SAFE PROBABILITY</span><small>{LOCATION.name}</small></div>
              <span className="horizon"><strong>{(MODEL_META.decisionThreshold * 100).toFixed(0)}%</strong> unsafe threshold</span>
            </div>

            <div className="risk-main">
              <div
                className="risk-dial"
                aria-label={safeProbability === null ? "Safe probability unavailable" : `Safe probability ${(safeProbability * 100).toFixed(1)} percent`}
                style={{ background: `conic-gradient(var(--risk-color) ${dialValue}%, #e5e5e5 ${dialValue}% 100%)` }}
              >
                <div><strong>{safeProbability === null ? "—" : (safeProbability * 100).toFixed(1)}</strong>{safeProbability !== null && <span>%</span>}</div>
                <small>MODEL SAFE PROBABILITY</small>
              </div>
              <div className="risk-verdict">
                <p>MODEL CLASSIFICATION</p>
                <h2>{statusLabel}</h2>
                <span className="verdict-code">UNSAFE IS THE POSITIVE CLASS</span>
                <p className="risk-action">
                  {dataState === "live"
                    ? `Unsafe is reported only when its model probability reaches ${(MODEL_META.decisionThreshold * 100).toFixed(0)}%.`
                    : dataState === "loading"
                      ? "Retrieving current weather and marine values from Open-Meteo."
                      : "Current Open-Meteo readings could not be loaded. No local fallback data are shown."}
                </p>
              </div>
            </div>

            <div className="probability-grid" aria-label="Model class probabilities">
              <div className={`probability-item ${status === "safe" ? "selected" : ""}`}>
                <div><span>SAFE</span><strong>{safeProbability === null ? "—" : percent(safeProbability)}</strong></div>
                <div className="probability-track"><i style={{ width: `${safeProbability === null ? 0 : safeProbability * 100}%` }} /></div>
              </div>
              <div className={`probability-item ${status === "unsafe" ? "selected" : ""}`}>
                <div><span>UNSAFE</span><strong>{unsafeProbability === null ? "—" : percent(unsafeProbability)}</strong></div>
                <div className="probability-track"><i style={{ width: `${unsafeProbability === null ? 0 : unsafeProbability * 100}%` }} /></div>
              </div>
            </div>

            <div className={`data-notice ${dataState === "unavailable" ? "unavailable" : ""}`}>
              <span>{dataState === "live" ? "✓" : dataState === "loading" ? "…" : "!"}</span>
              <p>{dataState === "live" ? `Live API values observed ${observedLabel}.` : dataState === "loading" ? "Connecting to Open-Meteo…" : "Live data unavailable; the model result is withheld."}</p>
            </div>
          </article>

          <article className="context-panel">
            <div className="context-header">
              <div><span>LIVE MODEL INPUTS</span><strong>Open-Meteo current parameters</strong></div>
              <button type="button" onClick={refresh} disabled={dataState === "loading"}><span aria-hidden="true">↻</span>Refresh</button>
            </div>
            <div className="weather-summary">
              <div className="weather-glyph" aria-hidden="true"><span /></div>
              <div><strong>{value(reading.airTemperature)}°</strong><span>Air temperature</span></div>
              <dl>
                <div><dt>WMO</dt><dd>{value(reading.weatherCode, 0)}</dd></div>
                <div><dt>TIDE</dt><dd>{reading.tideTrend}</dd></div>
              </dl>
            </div>
            <div className="live-table-wrap">
              <table className="live-data-table">
                <thead><tr><th>Parameter</th><th>Current</th><th>Unit</th></tr></thead>
                <tbody>
                  {currentRows.map(([label, currentValue, unit]) => (
                    <tr key={label}><th scope="row">{label}</th><td>{currentValue}</td><td>{unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="freshness-row"><span><i />{dataState === "live" ? "OPEN-METEO LIVE" : dataState.toUpperCase()}</span><time>{observedLabel}</time></div>
          </article>
        </div>
      </section>

      <section className="evidence section" id="evaluation">
        <div className="section-heading">
          <div>
            <p className="kicker"><span>03</span>ALGORITHM EVALUATION</p>
            <h2>Hourly 2026 holdout,<em>including false positives.</em></h2>
          </div>
          <p>Test period: 1 January–30 June 2026. Positive class: unsafe. Decision threshold: {(MODEL_META.decisionThreshold * 100).toFixed(0)}%.</p>
        </div>

        <div className="metric-row confusion-count-row" aria-label="Confusion matrix counts">
          <article><span>TRUE POSITIVE</span><strong>{truePositive}</strong></article>
          <article><span>FALSE POSITIVE</span><strong>{falsePositive}</strong></article>
          <article><span>TRUE NEGATIVE</span><strong>{trueNegative}</strong></article>
          <article><span>FALSE NEGATIVE</span><strong>{falseNegative}</strong></article>
        </div>

        <div className="metric-row score-row" aria-label="Classification metrics">
          <article><span>ACCURACY</span><strong>{percent(metrics.accuracy)}</strong></article>
          <article><span>RECALL · UNSAFE</span><strong>{percent(metrics.unsafe.recall)}</strong></article>
          <article><span>PRECISION · UNSAFE</span><strong>{percent(metrics.unsafe.precision)}</strong></article>
          <article><span>F1 · UNSAFE</span><strong>{percent(metrics.unsafe.f1)}</strong></article>
        </div>

        <div className="evidence-grid evaluation-grid">
          <article className="matrix-card">
            <div className="panel-title">
              <div><span>2026 TEST CONFUSION MATRIX</span><h3>Safe / unsafe classification</h3></div>
              <em>N = {MODEL_META.testRows.toLocaleString("en-GB")}</em>
            </div>
            <div className="matrix-wrap">
              <div className="matrix-axis axis-top">PREDICTED CLASS →</div>
              <div className="matrix-axis axis-left">ACTUAL CLASS</div>
              <div className="matrix-labels top-labels binary-labels"><span>SAFE</span><span>UNSAFE</span></div>
              <div className="matrix-labels side-labels binary-labels"><span>SAFE</span><span>UNSAFE</span></div>
              <div className="matrix binary-matrix">
                {MODEL_META.confusionMatrix.flatMap((row, rowIndex) => row.map((count, columnIndex) => (
                  <div
                    className={rowIndex === columnIndex ? "diagonal" : ""}
                    style={{ "--cell-alpha": Math.max(0.06, count / maxCell(MODEL_META.confusionMatrix)) } as CSSProperties}
                    key={`${rowIndex}-${columnIndex}`}
                  >
                    {count.toLocaleString("en-GB")}
                  </div>
                )))}
              </div>
            </div>
            <p className="panel-note">{truePositive} of 24 unsafe-labelled hours were detected; those 24 hours belong to one warning window, not 24 independent events. {falsePositive} safe hours were false positives.</p>
          </article>

          <article className="importance-card">
            <div className="panel-title">
              <div><span>MODEL INTERPRETATION</span><h3>Leading standardised coefficients</h3></div>
              <em>|COEF|</em>
            </div>
            <div className="importance-list">
              {MODEL_META.featureImportance.slice(0, 7).map((item, index) => (
                <div key={item.feature}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{FEATURE_LABELS[item.feature] ?? item.feature}</strong>
                  <div><i style={{ width: `${item.relative_importance}%` }} /></div>
                  <em>{item.relative_importance}</em>
                </div>
              ))}
            </div>
            <div className="finding"><span>INTERPRETATION LIMIT</span><p>Coefficient size does not establish causation.</p></div>
          </article>
        </div>
      </section>

      <section className="method section" id="data">
        <div className="section-heading method-heading">
          <div>
            <p className="kicker"><span>04</span>MODELLED HISTORICAL INPUTS</p>
            <h2>One location,<em>one auditable pipeline.</em></h2>
          </div>
        </div>

        <div className="pipeline">
          {[
            ["01", "Labelled dataset", MODEL_META.rows.toLocaleString("en-GB"), "hourly rows"],
            ["02", "Training Set", MODEL_META.trainingRows.toLocaleString("en-GB"), "2023–2024"],
            ["03", "Validation Set", MODEL_META.validationRows.toLocaleString("en-GB"), "2025"],
            ["04", "Test Set", MODEL_META.testRows.toLocaleString("en-GB"), "2026 H1"],
          ].map((step, index) => (
            <article key={step[0]}>
              <span>{step[0]}</span><div><small>{step[1]}</small><strong>{step[2]}</strong><p>{step[3]}</p></div>
              {index < 3 && <i aria-hidden="true">→</i>}
            </article>
          ))}
        </div>

        <div className="research-grid">
          <article className="dataset-card">
            <div className="panel-title"><div><span>DATASET CONTENTS</span><h3>Great Yarmouth · 2023–2026 H1</h3></div><em>SINGLE-SITE BASELINE</em></div>
            <div className="dataset-stats">
              <div><strong>{MODEL_META.rows.toLocaleString("en-GB")}</strong><span>valid rows</span></div>
              <div><strong>{MODEL_META.featureCount}</strong><span>model features</span></div>
              <div><strong>{MODEL_META.warningEvents}</strong><span>alert issuances</span></div>
              <div><strong>2</strong><span>safe / unsafe</span></div>
            </div>
            <ul className="dataset-list">
              <li><span>01</span>Weather: temperature, humidity, rain, wind, gusts and pressure.</li>
              <li><span>02</span>Marine: waves, sea level, sea temperature and currents.</li>
              <li><span>03</span>Labels: safe / unsafe proxy classes derived from a warning-issuance time window.</li>
            </ul>
          </article>

          <article className="limitations-card">
            <div className="panel-title"><div><span>LIMITS AND FLAWS</span><h3>Current problems remaining</h3></div><em>OPEN</em></div>
            <ol>
              <li><span>01</span><div><strong>One 2026 warning event</strong><p>Very few positive samples in test set from 24 hours.</p></div></li>
              <li><span>02</span><div><strong>Low unsafe precision</strong><p>Only {percent(metrics.unsafe.precision)} precision with {falsePositive.toLocaleString("en-GB")} false positives.</p></div></li>
              <li><span>03</span><div><strong>Proxy target</strong><p>The label describes hours around an alert issuance; it is not a verified disaster outcome or a strictly future-only target.</p></div></li>
              <li><span>04</span><div><strong>No rule baseline yet</strong><p>These metrics alone do not prove that Logistic Regression improves on a transparent threshold rule.</p></div></li>
            </ol>
          </article>
        </div>
      </section>

      <section className="safety-note section">
        <span className="safety-icon">!</span>
        <div><strong>RESEARCH PROTOTYPE · NOT AN OFFICIAL PUBLIC WARNING</strong><p>The displayed probabilities are classifier scores for proxy labels, not calibrated disaster probabilities. Do not use this model alone for evacuation, rescue, navigation or personal-safety decisions.</p></div>
      </section>

      <footer className="footer section">
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>COASTWATCH</strong><small>GREAT YARMOUTH · DATA STUDY</small></span></div>
        <p>INPUTS: OPEN-METEO MODEL / REANALYSIS · ALERT RECORDS: FLOODRADAR REPRODUCTION OF EA DATA</p>
        <a href="#project">Back to top ↑</a>
      </footer>
    </main>
  );
}
