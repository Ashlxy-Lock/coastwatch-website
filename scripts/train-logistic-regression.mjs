import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, "data", "great-yarmouth-coastal-training.csv");
const METADATA_PATH = path.join(ROOT, "data", "great-yarmouth-dataset-metadata.json");
const MODEL_JSON_PATH = path.join(ROOT, "data", "great-yarmouth-logistic-model.json");
const MODEL_TS_PATH = path.join(ROOT, "app", "trained-model.ts");

const FEATURES = [
  "temperature_2m_c",
  "relative_humidity_2m_percent",
  "rain_mm",
  "wind_speed_10m_kmh",
  "wind_gusts_10m_kmh",
  "pressure_msl_hpa",
  "wave_height_m",
  "wave_period_s",
  "sea_level_height_msl_m",
  "sea_surface_temperature_c",
  "ocean_current_velocity_kmh",
  "hour_sin",
  "hour_cos",
  "day_of_year_sin",
  "day_of_year_cos",
];

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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fitStandardizer(rows) {
  const medians = FEATURES.map((feature) => median(rows.map((row) => Number(row[feature])).filter(Number.isFinite)));
  const means = FEATURES.map((feature, featureIndex) => {
    const values = rows.map((row) => Number(row[feature])).map((value) => Number.isFinite(value) ? value : medians[featureIndex]);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const scales = FEATURES.map((feature, featureIndex) => {
    const values = rows.map((row) => Number(row[feature])).map((value) => Number.isFinite(value) ? value : medians[featureIndex]);
    const variance = values.reduce((sum, value) => sum + (value - means[featureIndex]) ** 2, 0) / values.length;
    return Math.sqrt(variance) || 1;
  });
  return { medians, means, scales };
}

function transform(rows, standardizer) {
  return rows.map((row) => FEATURES.map((feature, index) => {
    const raw = Number(row[feature]);
    const value = Number.isFinite(raw) ? raw : standardizer.medians[index];
    return (value - standardizer.means[index]) / standardizer.scales[index];
  }));
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function trainLogistic(x, y, { epochs = 900, learningRate = 0.035, l2 = 0.02 } = {}) {
  const coefficients = Array(FEATURES.length).fill(0);
  const firstMoment = Array(FEATURES.length + 1).fill(0);
  const secondMoment = Array(FEATURES.length + 1).fill(0);
  let intercept = 0;
  const positives = y.reduce((sum, value) => sum + value, 0);
  const negatives = y.length - positives;
  if (!positives || !negatives) throw new Error("Both safe and unsafe rows are required for logistic regression.");
  const classWeights = [y.length / (2 * negatives), y.length / (2 * positives)];
  const beta1 = 0.9;
  const beta2 = 0.999;
  const epsilon = 1e-8;

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const gradient = Array(FEATURES.length).fill(0);
    let interceptGradient = 0;
    let weightSum = 0;
    for (let rowIndex = 0; rowIndex < x.length; rowIndex += 1) {
      let logit = intercept;
      for (let index = 0; index < coefficients.length; index += 1) logit += coefficients[index] * x[rowIndex][index];
      const weight = classWeights[y[rowIndex]];
      const error = (sigmoid(logit) - y[rowIndex]) * weight;
      interceptGradient += error;
      weightSum += weight;
      for (let index = 0; index < gradient.length; index += 1) gradient[index] += error * x[rowIndex][index];
    }
    interceptGradient /= weightSum;
    for (let index = 0; index < gradient.length; index += 1) {
      gradient[index] = gradient[index] / weightSum + l2 * coefficients[index];
    }
    const allGradients = [...gradient, interceptGradient];
    for (let index = 0; index < allGradients.length; index += 1) {
      firstMoment[index] = beta1 * firstMoment[index] + (1 - beta1) * allGradients[index];
      secondMoment[index] = beta2 * secondMoment[index] + (1 - beta2) * allGradients[index] ** 2;
      const correctedFirst = firstMoment[index] / (1 - beta1 ** epoch);
      const correctedSecond = secondMoment[index] / (1 - beta2 ** epoch);
      const update = learningRate * correctedFirst / (Math.sqrt(correctedSecond) + epsilon);
      if (index < coefficients.length) coefficients[index] -= update;
      else intercept -= update;
    }
  }
  return { coefficients, intercept, classWeights, hyperparameters: { epochs, learningRate, l2, optimizer: "Adam" } };
}

function probabilities(model, x) {
  return x.map((values) => sigmoid(model.intercept + values.reduce((sum, value, index) => sum + value * model.coefficients[index], 0)));
}

function confusion(y, scores, threshold) {
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let tp = 0;
  for (let index = 0; index < y.length; index += 1) {
    const predicted = scores[index] >= threshold ? 1 : 0;
    if (y[index] === 1 && predicted === 1) tp += 1;
    else if (y[index] === 1) fn += 1;
    else if (predicted === 1) fp += 1;
    else tn += 1;
  }
  return [[tn, fp], [fn, tp]];
}

function divide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function metrics(matrix) {
  const [[tn, fp], [fn, tp]] = matrix;
  const unsafePrecision = divide(tp, tp + fp);
  const unsafeRecall = divide(tp, tp + fn);
  const safePrecision = divide(tn, tn + fn);
  const safeRecall = divide(tn, tn + fp);
  const unsafeF1 = divide(2 * unsafePrecision * unsafeRecall, unsafePrecision + unsafeRecall);
  const safeF1 = divide(2 * safePrecision * safeRecall, safePrecision + safeRecall);
  return {
    accuracy: divide(tp + tn, tp + tn + fp + fn),
    balanced_accuracy: (unsafeRecall + safeRecall) / 2,
    macro_f1: (unsafeF1 + safeF1) / 2,
    safe: { precision: safePrecision, recall: safeRecall, f1: safeF1, support: tn + fp },
    unsafe: { precision: unsafePrecision, recall: unsafeRecall, f1: unsafeF1, support: tp + fn },
  };
}

function unsafeF2(result) {
  const { precision, recall } = result.unsafe;
  return divide(5 * precision * recall, 4 * precision + recall);
}

function chooseThreshold(y, scores) {
  const candidates = [];
  for (let integer = 75; integer <= 95; integer += 1) {
    const threshold = integer / 100;
    const matrix = confusion(y, scores, threshold);
    const result = metrics(matrix);
    candidates.push({ threshold, matrix, metrics: result, unsafe_f2: unsafeF2(result) });
  }
  return candidates.sort((a, b) =>
    b.unsafe_f2 - a.unsafe_f2 ||
    b.metrics.unsafe.recall - a.metrics.unsafe.recall ||
    b.metrics.unsafe.precision - a.metrics.unsafe.precision ||
    a.threshold - b.threshold,
  )[0];
}

function rounded(value, digits = 10) {
  return Number(value.toFixed(digits));
}

function countLabels(rows) {
  return rows.reduce((counts, row) => ({ ...counts, [row.label]: (counts[row.label] ?? 0) + 1 }), {});
}

async function main() {
  const [csv, datasetMetadata] = await Promise.all([
    readFile(DATA_PATH, "utf8"),
    readFile(METADATA_PATH, "utf8").then(JSON.parse),
  ]);
  const rows = parseCsv(csv).sort((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));
  if (!rows.length) throw new Error("Training CSV is empty. Run npm run data:build first.");
  const train = rows.filter((row) => row.timestamp_utc < "2025-01-01T00:00:00.000Z");
  const validation = rows.filter((row) =>
    row.timestamp_utc >= "2025-01-01T00:00:00.000Z" && row.timestamp_utc < "2026-01-01T00:00:00.000Z"
  );
  const test = rows.filter((row) => row.timestamp_utc >= "2026-01-01T00:00:00.000Z");
  for (const [name, split] of Object.entries({ train, validation, test })) {
    const labels = countLabels(split);
    if (!split.length || !labels.safe || !labels.unsafe) throw new Error(`${name} must contain both labels: ${JSON.stringify(labels)}`);
  }

  console.log("Training Logistic Regression on 2023-2024...");
  const standardizer = fitStandardizer(train);
  const trained = trainLogistic(
    transform(train, standardizer),
    train.map((row) => Number(row.label === "unsafe")),
  );
  console.log("Selecting a conservative threshold on the 2025 validation set...");
  const validationLabels = validation.map((row) => Number(row.label === "unsafe"));
  const validationScores = probabilities(trained, transform(validation, standardizer));
  const selected = chooseThreshold(validationLabels, validationScores);
  console.log("Evaluating the selected threshold on untouched 2026 data...");
  const testScores = probabilities(trained, transform(test, standardizer));
  const decisionThreshold = selected.threshold;
  const testMatrix = confusion(test.map((row) => Number(row.label === "unsafe")), testScores, decisionThreshold);
  const testMetrics = metrics(testMatrix);
  const importance = FEATURES.map((feature, index) => ({ feature, magnitude: Math.abs(trained.coefficients[index]) }))
    .sort((a, b) => b.magnitude - a.magnitude);
  const maximumImportance = importance[0].magnitude || 1;
  const normalizedImportance = importance.map((item) => ({
    feature: item.feature,
    coefficient: rounded(trained.coefficients[FEATURES.indexOf(item.feature)]),
    relative_importance: Math.round((item.magnitude / maximumImportance) * 100),
  }));
  const generatedAt = new Date().toISOString();
  const artifact = {
    model: "Binary Logistic Regression",
    version: "coastal-risk-logreg-great-yarmouth-v2",
    generated_at_utc: generatedAt,
    training_period: "2023-01-01..2024-12-31",
    validation_period: "2025-01-01..2025-12-31",
    test_period: "2026-01-01..2026-06-30",
    feature_names: FEATURES,
    medians: standardizer.medians.map((value) => rounded(value)),
    means: standardizer.means.map((value) => rounded(value)),
    scales: standardizer.scales.map((value) => rounded(value)),
    coefficients: trained.coefficients.map((value) => rounded(value)),
    intercept: rounded(trained.intercept),
    decision_threshold: decisionThreshold,
    threshold_policy: "Selected on the 2025 validation year from thresholds 0.75..0.95 by maximum unsafe F2; the 2026 holdout is not used for threshold tuning.",
    class_weights: trained.classWeights.map((value) => rounded(value)),
    hyperparameters: trained.hyperparameters,
    rows: rows.length,
    warning_events: datasetMetadata.warning_events,
    label_counts: countLabels(rows),
    splits: {
      train_2023_2024: { rows: train.length, labels: countLabels(train) },
      validation_2025: { rows: validation.length, labels: countLabels(validation) },
      test_2026: { rows: test.length, labels: countLabels(test) },
    },
    validation_threshold_metrics: selected,
    test_confusion_matrix: testMatrix,
    test_metrics: testMetrics,
    feature_importance: normalizedImportance,
  };
  await writeFile(MODEL_JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const ts = `// Generated by scripts/train-logistic-regression.mjs. Do not hand-edit.\n` +
    `export const TRAINED_MODEL = ${JSON.stringify(artifact, null, 2)} as const;\n`;
  await writeFile(MODEL_TS_PATH, ts, "utf8");
  console.log(`Threshold: ${decisionThreshold.toFixed(2)}`);
  console.log(`2026 unsafe recall: ${(testMetrics.unsafe.recall * 100).toFixed(1)}%`);
  console.log(`2026 Macro-F1: ${(testMetrics.macro_f1 * 100).toFixed(1)}%`);
  console.log(path.relative(ROOT, MODEL_JSON_PATH));
}

await main();
