import { TRAINED_MODEL } from "./trained-model";

export type RiskName = "safe" | "unsafe";

export type EnvironmentReading = {
  airTemperature: number | null;
  humidity: number | null;
  rain: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  pressureMsl: number | null;
  windDirection: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  waterTemperature: number | null;
  seaLevel: number | null;
  currentVelocity: number | null;
  currentDirection: number | null;
  weatherCode: number | null;
  tideTrend: "rising" | "falling" | "steady" | "unknown";
};

export type ModelPrediction = {
  level: number;
  name: RiskName;
  probability: number;
  probabilities: number[];
  unsafeProbability: number;
  reasons: string[];
  missing: string[];
};

const REASON_CODES: Record<string, string> = {
  temperature_2m_c: "AIR_TEMPERATURE_SIGNAL",
  relative_humidity_2m_percent: "HUMIDITY_SIGNAL",
  rain_mm: "RAIN_SIGNAL",
  wind_speed_10m_kmh: "WIND_SIGNAL",
  wind_gusts_10m_kmh: "WIND_GUST_SIGNAL",
  pressure_msl_hpa: "PRESSURE_SIGNAL",
  wave_height_m: "WAVE_HEIGHT_SIGNAL",
  wave_period_s: "WAVE_PERIOD_SIGNAL",
  sea_level_height_msl_m: "SEA_LEVEL_CONTEXT",
  sea_surface_temperature_c: "WATER_TEMPERATURE_SIGNAL",
  ocean_current_velocity_kmh: "OCEAN_CURRENT_SIGNAL",
  hour_sin: "TIME_OF_DAY_CONTEXT",
  hour_cos: "TIME_OF_DAY_CONTEXT",
  day_of_year_sin: "SEASONAL_CONTEXT",
  day_of_year_cos: "SEASONAL_CONTEXT",
};

function dayOfYear(date: Date) {
  const first = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - first) / 86_400_000);
}

function sigmoid(value: number) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

export function predictRisk(
  reading: EnvironmentReading,
  timestamp = new Date(),
): ModelPrediction {
  const hour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60;
  const year = timestamp.getUTCFullYear();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const hourAngle = (2 * Math.PI * hour) / 24;
  const dayAngle = (2 * Math.PI * (dayOfYear(timestamp) - 1)) / (leap ? 366 : 365);
  const valuesByFeature: Record<string, number | null> = {
    temperature_2m_c: reading.airTemperature,
    relative_humidity_2m_percent: reading.humidity,
    rain_mm: reading.rain,
    wind_speed_10m_kmh: reading.windSpeed,
    wind_gusts_10m_kmh: reading.windGusts,
    pressure_msl_hpa: reading.pressureMsl,
    wave_height_m: reading.waveHeight,
    wave_period_s: reading.wavePeriod,
    sea_level_height_msl_m: reading.seaLevel,
    sea_surface_temperature_c: reading.waterTemperature,
    ocean_current_velocity_kmh: reading.currentVelocity,
    hour_sin: Math.sin(hourAngle),
    hour_cos: Math.cos(hourAngle),
    day_of_year_sin: Math.sin(dayAngle),
    day_of_year_cos: Math.cos(dayAngle),
  };
  const raw = TRAINED_MODEL.feature_names.map((name) => valuesByFeature[name]);
  const missing = TRAINED_MODEL.feature_names.filter((_, index) => raw[index] == null);
  const standardized = raw.map((value, index) => {
    const imputed = value == null ? TRAINED_MODEL.medians[index] : value;
    return (imputed - TRAINED_MODEL.means[index]) / TRAINED_MODEL.scales[index];
  });
  const logit = TRAINED_MODEL.intercept + TRAINED_MODEL.coefficients.reduce(
    (sum, coefficient, index) => sum + coefficient * standardized[index],
    0,
  );
  const unsafeProbability = sigmoid(logit);
  const probabilities = [1 - unsafeProbability, unsafeProbability];
  const level = unsafeProbability >= TRAINED_MODEL.decision_threshold ? 1 : 0;
  const contributions = TRAINED_MODEL.feature_names.map((name, index) => ({
    name,
    value: TRAINED_MODEL.coefficients[index] * standardized[index],
  }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const reasons = [...new Set(contributions.map((item) => REASON_CODES[item.name]))].slice(0, 3);

  return {
    level,
    name: level === 1 ? "unsafe" : "safe",
    probability: probabilities[level],
    probabilities,
    unsafeProbability,
    reasons: level === 0 ? ["MODEL_LOW_RISK"] : reasons.length ? reasons : ["MODEL_COMBINED_SIGNAL"],
    missing: [...missing],
  };
}

export const MODEL_META = {
  name: TRAINED_MODEL.model,
  version: TRAINED_MODEL.version,
  horizonHours: 6,
  trainedAt: TRAINED_MODEL.generated_at_utc.slice(0, 10),
  rows: TRAINED_MODEL.rows,
  locations: 1,
  years: "2023–2026 H1",
  trainingYears: "2023–2024",
  validationYear: "2025",
  testYear: "2026 H1",
  featureCount: TRAINED_MODEL.feature_names.length,
  warningEvents: TRAINED_MODEL.warning_events,
  unsafeRows: TRAINED_MODEL.label_counts.unsafe,
  decisionThreshold: TRAINED_MODEL.decision_threshold,
  trainingRows: TRAINED_MODEL.splits.train_2023_2024.rows,
  validationRows: TRAINED_MODEL.splits.validation_2025.rows,
  testRows: TRAINED_MODEL.splits.test_2026.rows,
  confusionMatrix: TRAINED_MODEL.test_confusion_matrix.map((row) => [...row]),
  metrics: TRAINED_MODEL.test_metrics,
  featureImportance: TRAINED_MODEL.feature_importance,
  deploymentMode: "shadow",
} as const;
