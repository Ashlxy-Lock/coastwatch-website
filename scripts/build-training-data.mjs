import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const TRAINING_PATH = path.join(DATA_DIR, "great-yarmouth-coastal-training.csv");
const WARNING_PATH = path.join(DATA_DIR, "great-yarmouth-warning-events.csv");
const METADATA_PATH = path.join(DATA_DIR, "great-yarmouth-dataset-metadata.json");

const LOCATION = {
  name: "Great Yarmouth",
  admin1: "England",
  latitude: 52.60831,
  longitude: 1.73052,
  timezone: "Europe/London",
  geocodingSource: "https://geocoding-api.open-meteo.com/v1/search?name=Great%20Yarmouth&count=1&language=en&format=json",
};

const START_DATE = "2023-01-01";
const END_DATE = "2026-06-30";
const WARNING_WINDOW_BEFORE_HOURS = 6;
const WARNING_WINDOW_AFTER_HOURS = 18;
const WARNING_AREA_CODES = [
  "054FWCDV3A1",
  "054FWCDV3A2",
  "054FWCDV3A3",
  "054FWCDV3A4",
  "054FWCDV3A5",
  "054FWCDV3A6",
  "054FWCDV3A7",
  "054WACDV3A",
];
const COASTAL_ALERT_AREA_CODE = "054WACDV3A";
const COASTAL_ALERT_AREA_NAME = "The Norfolk coast from Caister to Gorleston, including Great Yarmouth";
const FLOODRADAR_URL = (code) => `https://www.floodradar.co.uk/flood-area/${code}`;
const EA_HISTORIC_WARNINGS_URL = "https://environment.data.gov.uk/dataset/88bed270-d465-11e4-8669-f0def148f590";

const WEATHER_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "rain",
  "wind_speed_10m",
  "wind_gusts_10m",
  "pressure_msl",
  "weather_code",
];

const MARINE_VARIABLES = [
  "wave_height",
  "wave_period",
  "sea_level_height_msl",
  "sea_surface_temperature",
  "ocean_current_velocity",
  "ocean_current_direction",
];

const MONTHS = new Map([
  ["Jan", 0], ["Feb", 1], ["Mar", 2], ["Apr", 3], ["May", 4], ["Jun", 5],
  ["Jul", 6], ["Aug", 7], ["Sep", 8], ["Oct", 9], ["Nov", 10], ["Dec", 11],
]);

function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(headers, rows) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return body.filter((items) => items.some(Boolean)).map((items) =>
    Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ""])),
  );
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "CoastWatch-Great-Yarmouth-dataset/2.0" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Request failed after ${attempts} attempts: ${url}\n${lastError}`);
}

function lastSunday(year, month) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  return date.getUTCDate() - date.getUTCDay();
}

function isUkSummerTime(year, month, day, hour) {
  if (month < 2 || month > 9) return false;
  if (month > 2 && month < 9) return true;
  if (month === 2) {
    const boundary = lastSunday(year, 2);
    return day > boundary || (day === boundary && hour >= 2);
  }
  const boundary = lastSunday(year, 9);
  return day < boundary || (day === boundary && hour < 2);
}

function localWarningToUtc({ day, month, year, hour, minute }) {
  const utcHour = hour - (isUkSummerTime(year, month, day, hour) ? 1 : 0);
  return new Date(Date.UTC(year, month, day, utcHour, minute));
}

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ");
}

function parseWarningHistory(html, areaCode) {
  const text = stripHtml(html);
  const pattern = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) at (\d{1,2}):(\d{2})(am|pm)\s+(Severe Flood Warning|Flood Warning|Flood Alert)/g;
  const events = [];
  for (const match of text.matchAll(pattern)) {
    const month = MONTHS.get(match[2]);
    if (month == null) continue;
    let hour = Number(match[4]) % 12;
    if (match[6] === "pm") hour += 12;
    const localParts = {
      day: Number(match[1]),
      month,
      year: Number(match[3]),
      hour,
      minute: Number(match[5]),
    };
    const issuedAt = localWarningToUtc(localParts);
    const severity = match[7];
    events.push({
      warning_id: `${areaCode}-${issuedAt.toISOString()}`,
      issued_at_utc: issuedAt.toISOString(),
      issued_at_local: `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${match[5]}`,
      severity,
      severity_level: severity === "Severe Flood Warning" ? 1 : severity === "Flood Warning" ? 2 : 3,
      warning_area_code: areaCode,
      warning_area_name: areaCode === COASTAL_ALERT_AREA_CODE ? COASTAL_ALERT_AREA_NAME : "Great Yarmouth flood warning area",
      source_url: FLOODRADAR_URL(areaCode),
      source_attribution: "Environment Agency record reproduced by FloodRadar",
    });
  }
  return events;
}

async function queryWarnings() {
  const pages = await Promise.all(WARNING_AREA_CODES.map(async (code) => {
    const response = await fetchWithRetry(FLOODRADAR_URL(code));
    return parseWarningHistory(await response.text(), code);
  }));
  const start = Date.parse(`${START_DATE}T00:00:00Z`);
  const end = Date.parse(`${END_DATE}T23:59:59Z`);
  const deduplicated = new Map();
  for (const event of pages.flat()) {
    const issuedAt = Date.parse(event.issued_at_utc);
    if (issuedAt >= start && issuedAt <= end) deduplicated.set(event.warning_id, event);
  }
  return [...deduplicated.values()].sort((a, b) => a.issued_at_utc.localeCompare(b.issued_at_utc));
}

async function loadWarnings() {
  if (process.argv.includes("--reuse-warnings")) {
    return parseCsv(await readFile(WARNING_PATH, "utf8")).map((event) => ({
      ...event,
      severity_level: Number(event.severity_level),
    }));
  }
  const events = await queryWarnings();
  if (!events.length) throw new Error("No Great Yarmouth warning events were found; refusing to create all-safe labels.");
  const headers = [
    "warning_id", "issued_at_utc", "issued_at_local", "severity", "severity_level",
    "warning_area_code", "warning_area_name", "source_url", "source_attribution",
  ];
  await writeFile(WARNING_PATH, toCsv(headers, events), "utf8");
  return events;
}

function yearlyRanges() {
  const ranges = [];
  const firstYear = Number(START_DATE.slice(0, 4));
  const lastYear = Number(END_DATE.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    ranges.push({
      start: year === firstYear ? START_DATE : `${year}-01-01`,
      end: year === lastYear ? END_DATE : `${year}-12-31`,
    });
  }
  return ranges;
}

function endpoint(base, range, variables, extra = {}) {
  const query = new URLSearchParams({
    latitude: String(LOCATION.latitude),
    longitude: String(LOCATION.longitude),
    start_date: range.start,
    end_date: range.end,
    hourly: variables.join(","),
    timezone: "GMT",
    ...extra,
  });
  return `${base}?${query}`;
}

async function fetchRange(range) {
  const weatherUrl = endpoint(
    "https://archive-api.open-meteo.com/v1/archive",
    range,
    WEATHER_VARIABLES,
    { wind_speed_unit: "kmh" },
  );
  const marineUrl = endpoint(
    "https://marine-api.open-meteo.com/v1/marine",
    range,
    MARINE_VARIABLES,
    { velocity_unit: "kmh", cell_selection: "sea" },
  );
  const [weatherResponse, marineResponse] = await Promise.all([
    fetchWithRetry(weatherUrl),
    fetchWithRetry(marineUrl),
  ]);
  const [weather, marine] = await Promise.all([weatherResponse.json(), marineResponse.json()]);
  if (!weather.hourly?.time || !marine.hourly?.time) throw new Error(`Open-Meteo returned no hourly data for ${range.start}`);
  return { weather, marine, weatherUrl, marineUrl };
}

function valueAt(hourly, key, index) {
  const value = hourly[key]?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dayOfYear(date) {
  return Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
}

function matchingWarnings(timestampMs, warnings) {
  const before = WARNING_WINDOW_BEFORE_HOURS * 3_600_000;
  const after = WARNING_WINDOW_AFTER_HOURS * 3_600_000;
  return warnings.filter((event) => {
    const issuedAt = Date.parse(event.issued_at_utc);
    return timestampMs >= issuedAt - before && timestampMs < issuedAt + after;
  });
}

function mergeRange(payload, warnings) {
  const marineIndex = new Map(payload.marine.hourly.time.map((time, index) => [time, index]));
  const rows = [];
  let droppedRows = 0;
  const missingRequired = {};
  for (let index = 0; index < payload.weather.hourly.time.length; index += 1) {
    const rawTime = payload.weather.hourly.time[index];
    const marineRow = marineIndex.get(rawTime);
    if (marineRow == null) {
      droppedRows += 1;
      continue;
    }
    const date = new Date(`${rawTime}:00Z`);
    const yearLength = new Date(Date.UTC(date.getUTCFullYear(), 1, 29)).getUTCDate() === 29 ? 366 : 365;
    const hourAngle = (2 * Math.PI * date.getUTCHours()) / 24;
    const dayAngle = (2 * Math.PI * (dayOfYear(date) - 1)) / yearLength;
    const matched = matchingWarnings(date.getTime(), warnings);
    const row = {
      timestamp_utc: date.toISOString(),
      location: `${LOCATION.name}, ${LOCATION.admin1}`,
      latitude: LOCATION.latitude,
      longitude: LOCATION.longitude,
      temperature_2m_c: valueAt(payload.weather.hourly, "temperature_2m", index),
      relative_humidity_2m_percent: valueAt(payload.weather.hourly, "relative_humidity_2m", index),
      precipitation_mm: valueAt(payload.weather.hourly, "precipitation", index),
      rain_mm: valueAt(payload.weather.hourly, "rain", index),
      wind_speed_10m_kmh: valueAt(payload.weather.hourly, "wind_speed_10m", index),
      wind_gusts_10m_kmh: valueAt(payload.weather.hourly, "wind_gusts_10m", index),
      pressure_msl_hpa: valueAt(payload.weather.hourly, "pressure_msl", index),
      weather_code: valueAt(payload.weather.hourly, "weather_code", index),
      wave_height_m: valueAt(payload.marine.hourly, "wave_height", marineRow),
      wave_period_s: valueAt(payload.marine.hourly, "wave_period", marineRow),
      sea_level_height_msl_m: valueAt(payload.marine.hourly, "sea_level_height_msl", marineRow),
      sea_surface_temperature_c: valueAt(payload.marine.hourly, "sea_surface_temperature", marineRow),
      ocean_current_velocity_kmh: valueAt(payload.marine.hourly, "ocean_current_velocity", marineRow),
      ocean_current_direction_deg: valueAt(payload.marine.hourly, "ocean_current_direction", marineRow),
      hour_sin: Number(Math.sin(hourAngle).toFixed(8)),
      hour_cos: Number(Math.cos(hourAngle).toFixed(8)),
      day_of_year_sin: Number(Math.sin(dayAngle).toFixed(8)),
      day_of_year_cos: Number(Math.cos(dayAngle).toFixed(8)),
      matched_warning_ids: matched.map((event) => event.warning_id).join(";"),
      warning_area_codes: [...new Set(matched.map((event) => event.warning_area_code))].join(";"),
      warning_severity: [...new Set(matched.map((event) => event.severity))].join(";"),
      warning_issued_at_utc: matched.map((event) => event.issued_at_utc).join(";"),
      label: matched.length ? "unsafe" : "safe",
    };
    const required = [
      "temperature_2m_c", "relative_humidity_2m_percent", "rain_mm", "wind_speed_10m_kmh",
      "wind_gusts_10m_kmh", "pressure_msl_hpa", "wave_height_m", "wave_period_s",
      "sea_level_height_msl_m", "sea_surface_temperature_c", "ocean_current_velocity_kmh",
    ];
    if (required.some((key) => row[key] == null)) {
      for (const key of required) {
        if (row[key] == null) missingRequired[key] = (missingRequired[key] ?? 0) + 1;
      }
      droppedRows += 1;
      continue;
    }
    rows.push(row);
  }
  return { rows, droppedRows, missingRequired };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  console.log(process.argv.includes("--reuse-warnings")
    ? "Loading the saved Great Yarmouth warning history..."
    : "Querying the Great Yarmouth warning history...");
  const warnings = await loadWarnings();
  console.log(`Found ${warnings.length} warning issuances in ${START_DATE}..${END_DATE}.`);

  const rows = [];
  const apiRequests = [];
  let droppedRows = 0;
  const missingRequired = {};
  const gridCoordinates = [];
  for (const range of yearlyRanges()) {
    console.log(`Fetching Open-Meteo weather and marine data for ${range.start}..${range.end}...`);
    const payload = await fetchRange(range);
    const merged = mergeRange(payload, warnings);
    rows.push(...merged.rows);
    droppedRows += merged.droppedRows;
    for (const [key, count] of Object.entries(merged.missingRequired)) {
      missingRequired[key] = (missingRequired[key] ?? 0) + count;
    }
    console.log(`Kept ${merged.rows.length} rows; dropped ${merged.droppedRows} incomplete rows.`);
    apiRequests.push({ weather: payload.weatherUrl, marine: payload.marineUrl });
    gridCoordinates.push({
      range,
      weather: { latitude: payload.weather.latitude, longitude: payload.weather.longitude },
      marine: { latitude: payload.marine.latitude, longitude: payload.marine.longitude },
    });
  }
  rows.sort((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));
  const expectedRows = Math.round((Date.parse(`${END_DATE}T23:00:00Z`) - Date.parse(`${START_DATE}T00:00:00Z`)) / 3_600_000) + 1;
  if (rows.length < expectedRows * 0.95) {
    throw new Error(`Only ${rows.length}/${expectedRows} complete hourly rows were returned; refusing to save an incomplete dataset.`);
  }

  const headers = Object.keys(rows[0]);
  await writeFile(TRAINING_PATH, toCsv(headers, rows), "utf8");
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.label]: (acc[row.label] ?? 0) + 1 }), {});
  const metadata = {
    generated_at_utc: new Date().toISOString(),
    contains_synthetic_data: false,
    location: LOCATION,
    period: { start: START_DATE, end: END_DATE, resolution: "hourly", timezone: "GMT" },
    rows: rows.length,
    expected_rows: expectedRows,
    dropped_incomplete_rows: droppedRows,
    incomplete_rows_by_required_field: missingRequired,
    labels: counts,
    warning_events: warnings.length,
    labeling_policy: {
      unsafe: `The sample falls between ${WARNING_WINDOW_BEFORE_HOURS} hours before and ${WARNING_WINDOW_AFTER_HOURS} hours after an Environment Agency warning issuance (24-hour event window).`,
      implementation: `unsafe when sample >= issuance - ${WARNING_WINDOW_BEFORE_HOURS}h and sample < issuance + ${WARNING_WINDOW_AFTER_HOURS}h; safe otherwise`,
      rationale: "The six hours before issuance align with the model forecast horizon; the following 18 hours retain the hazardous event context. The historic feed does not publish warning-removal times.",
    },
    sources: {
      weather: "Open-Meteo Historical Weather API (reanalysis)",
      marine: "Open-Meteo Marine API historical model archive",
      warnings: "Environment Agency warning history reproduced by FloodRadar; cross-reference to the EA Historic Flood Warnings catalogue",
      environment_agency_catalogue: EA_HISTORIC_WARNINGS_URL,
      warning_pages: WARNING_AREA_CODES.map(FLOODRADAR_URL),
      api_requests: apiRequests,
      attribution: [
        "Weather and marine data: Open-Meteo; marine source models include DWD and Copernicus/ECMWF providers documented by Open-Meteo.",
        "Flood warning records: Environment Agency copyright and/or database right; Open Government Licence v3.0.",
      ],
    },
    returned_grid_coordinates: gridCoordinates,
    artifacts: {
      training_csv: path.relative(ROOT, TRAINING_PATH).replaceAll("\\", "/"),
      warnings_csv: path.relative(ROOT, WARNING_PATH).replaceAll("\\", "/"),
    },
  };
  await writeFile(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`Saved ${rows.length} real hourly rows (${counts.unsafe ?? 0} unsafe, ${counts.safe ?? 0} safe).`);
  console.log(path.relative(ROOT, TRAINING_PATH));
}

await main();
