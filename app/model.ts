export type RiskName = "safe" | "advisory" | "warning" | "critical";

export type EnvironmentReading = {
  airTemperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
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
  reasons: string[];
  missing: string[];
};

const FEATURE_NAMES = [
  "air_temperature_c",
  "humidity_percent",
  "wind_speed_kmh",
  "wave_height_m",
  "wave_period_s",
  "water_temperature_c",
  "sea_level_height_m",
  "ocean_current_velocity_kmh",
  "hour_sin",
  "hour_cos",
  "day_of_year_sin",
  "day_of_year_cos",
  "latitude",
  "longitude",
] as const;

const MEDIANS = [
  10.3, 83, 15.6, 0.62, 5, 11.2, -0.31, 0.9,
  1.2246467991473532e-16, 6.123233995736766e-17,
  0.40045390565126643, 0.11135519690480827,
  51.15419, -2.6390700000000002,
];

const MEANS = [
  10.247099972833507, 81.31037761477859, 16.69904917142106,
  0.7883732681336703, 5.492805623471895, 11.799195870686976,
  -0.31254061396360966, 1.1669424069546335, 0.0002687756362153072,
  0.00035027522871739386, 0.2040897859691443, 0.06972735196659699,
  52.54722999998674, -2.7199883333342316,
];

const SCALES = [
  4.757160191693706, 11.36563058963792, 8.775774483570846,
  0.6180789262888678, 2.0799842420411876, 3.4967627602718467,
  1.5883511507014882, 1.0131383437936148, 0.7070779150584827,
  0.7071355083034967, 0.6965813853434241, 0.6842951331434768,
  2.499267198873817, 1.8541019715341318,
];

const COEFFICIENTS = [
  [
    0.23619157818626477, -0.3030205879324109, -1.5484142453688063,
    -2.9247943857685543, 0.7492136329933905, 0.017998519089131734,
    -0.03335006469323811, 0.045724628984518303, -0.26563273820940786,
    -0.02389192075956888, 0.08493136865021927, -0.28333613662133356,
    0.0608475640140113, 0.09714122235927855,
  ],
  [
    0.01838369065954565, -0.07958729882937783, -0.24042721882155327,
    -0.5223278472510142, 0.37776478448413836, 0.2630378622726687,
    -0.051492163192505845, -0.016709319146083704, -0.0004928654263218066,
    -0.06578811977833363, 0.16186508331334082, 0.007697707028234242,
    0.16237803682466492, -0.07048161344807016,
  ],
  [
    -0.022284107028047423, 0.01510968941188354, 0.5501679401824694,
    0.7566934039253107, -0.03245576170277862, 0.043770673275942105,
    -0.027852968751469753, -0.03461265003476967, 0.09225647087007731,
    0.0627500747496403, 0.04018282337997527, 0.024338130868849915,
    0.033898212175332246, 0.21524748788723433,
  ],
  [
    -0.23229116181776374, 0.3674981973499044, 1.2386735240078988,
    2.6904288290942495, -1.0945226557747583, -0.3248070546377407,
    0.11269519663721468, 0.005597340196336638, 0.17386913276565075,
    0.026929965788259777, -0.28697927534353684, 0.25130029872424847,
    -0.2571238130140056, -0.24190709679843878,
  ],
];

const INTERCEPTS = [
  3.4855202866232142,
  2.3843879155562875,
  -0.1357631833562605,
  -5.7341450188227805,
];

const CLASS_NAMES: RiskName[] = ["safe", "advisory", "warning", "critical"];

const REASON_CODES: Record<string, string> = {
  air_temperature_c: "AIR_TEMPERATURE_SIGNAL",
  humidity_percent: "HUMIDITY_SIGNAL",
  wind_speed_kmh: "WIND_SIGNAL",
  wave_height_m: "WAVE_HEIGHT_SIGNAL",
  wave_period_s: "WAVE_PERIOD_SIGNAL",
  water_temperature_c: "WATER_TEMPERATURE_SIGNAL",
  sea_level_height_m: "SEA_LEVEL_CONTEXT",
  ocean_current_velocity_kmh: "OCEAN_CURRENT_SIGNAL",
  hour_sin: "TIME_OF_DAY_CONTEXT",
  hour_cos: "TIME_OF_DAY_CONTEXT",
  day_of_year_sin: "SEASONAL_CONTEXT",
  day_of_year_cos: "SEASONAL_CONTEXT",
  latitude: "LOCATION_CONTEXT",
  longitude: "LOCATION_CONTEXT",
};

function dayOfYear(date: Date) {
  const first = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - first) / 86_400_000);
}

function softmax(values: number[]) {
  const maximum = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

export function predictRisk(
  reading: EnvironmentReading,
  latitude: number,
  longitude: number,
  timestamp = new Date(),
): ModelPrediction {
  const hour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60;
  const year = timestamp.getUTCFullYear();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const hourAngle = (2 * Math.PI * hour) / 24;
  const dayAngle = (2 * Math.PI * (dayOfYear(timestamp) - 1)) / (leap ? 366 : 365);
  const raw: Array<number | null> = [
    reading.airTemperature,
    reading.humidity,
    reading.windSpeed,
    reading.waveHeight,
    reading.wavePeriod,
    reading.waterTemperature,
    reading.seaLevel,
    reading.currentVelocity,
    Math.sin(hourAngle),
    Math.cos(hourAngle),
    Math.sin(dayAngle),
    Math.cos(dayAngle),
    latitude,
    longitude,
  ];
  const missing = FEATURE_NAMES.filter((_, index) => raw[index] == null);
  const standardized = raw.map((value, index) => {
    const imputed = value == null ? MEDIANS[index] : value;
    return (imputed - MEANS[index]) / SCALES[index];
  });
  const logits = COEFFICIENTS.map((coefficients, classIndex) =>
    INTERCEPTS[classIndex]
    + coefficients.reduce((sum, coefficient, index) => sum + coefficient * standardized[index], 0),
  );
  const probabilities = softmax(logits);
  const level = probabilities.indexOf(Math.max(...probabilities));
  const contributions = FEATURE_NAMES.map((name, index) => ({
    name,
    value: (COEFFICIENTS[level][index] - COEFFICIENTS[0][index]) * standardized[index],
  }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const reasons = [...new Set(contributions.map((item) => REASON_CODES[item.name]))].slice(0, 3);

  return {
    level,
    name: CLASS_NAMES[level],
    probability: probabilities[level],
    probabilities,
    reasons: level === 0 ? ["MODEL_LOW_RISK"] : reasons.length ? reasons : ["MODEL_COMBINED_SIGNAL"],
    missing: [...missing],
  };
}

export const MODEL_META = {
  name: "Multinomial Logistic Regression",
  version: "coastal-risk-logreg-v1",
  horizonHours: 6,
  trainedAt: "2026-08-05",
  rows: 105_228,
  locations: 6,
  years: "2024–2025",
  deploymentMode: "shadow",
};
