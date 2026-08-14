"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  MODEL_META,
  predictRisk,
  type EnvironmentReading,
  type RiskName,
} from "./model";

type Language = "zh" | "en";
type DataState = "loading" | "live" | "snapshot";

type Coast = {
  id: string;
  nameZh: string;
  nameEn: string;
  regionZh: string;
  regionEn: string;
  latitude: number;
  longitude: number;
  fallback: EnvironmentReading;
};

const COASTS: Coast[] = [
  {
    id: "uk_brighton",
    nameZh: "布莱顿",
    nameEn: "Brighton",
    regionZh: "英格兰",
    regionEn: "England",
    latitude: 50.82838,
    longitude: -0.13947,
    fallback: {
      airTemperature: 18.4, humidity: 78, windSpeed: 27.2, windDirection: 228,
      waveHeight: 1.42, wavePeriod: 6.8, waterTemperature: 16.1, seaLevel: 0.18,
      currentVelocity: 1.1, currentDirection: 86, weatherCode: 3, tideTrend: "rising",
    },
  },
  {
    id: "uk_portsmouth",
    nameZh: "朴茨茅斯",
    nameEn: "Portsmouth",
    regionZh: "英格兰",
    regionEn: "England",
    latitude: 50.79899,
    longitude: -1.09125,
    fallback: {
      airTemperature: 18.9, humidity: 75, windSpeed: 22.6, windDirection: 235,
      waveHeight: 1.08, wavePeriod: 6.2, waterTemperature: 16.5, seaLevel: 0.12,
      currentVelocity: 0.9, currentDirection: 92, weatherCode: 2, tideTrend: "steady",
    },
  },
  {
    id: "uk_plymouth",
    nameZh: "普利茅斯",
    nameEn: "Plymouth",
    regionZh: "英格兰",
    regionEn: "England",
    latitude: 50.37153,
    longitude: -4.14305,
    fallback: {
      airTemperature: 17.6, humidity: 82, windSpeed: 34.8, windDirection: 246,
      waveHeight: 2.04, wavePeriod: 7.6, waterTemperature: 15.8, seaLevel: 0.26,
      currentVelocity: 1.4, currentDirection: 104, weatherCode: 61, tideTrend: "rising",
    },
  },
  {
    id: "uk_aberdeen",
    nameZh: "阿伯丁",
    nameEn: "Aberdeen",
    regionZh: "苏格兰",
    regionEn: "Scotland",
    latitude: 57.14369,
    longitude: -2.09814,
    fallback: {
      airTemperature: 13.2, humidity: 86, windSpeed: 42.5, windDirection: 18,
      waveHeight: 2.66, wavePeriod: 8.1, waterTemperature: 12.4, seaLevel: 0.34,
      currentVelocity: 1.7, currentDirection: 198, weatherCode: 63, tideTrend: "rising",
    },
  },
  {
    id: "uk_cardiff",
    nameZh: "卡迪夫",
    nameEn: "Cardiff",
    regionZh: "威尔士",
    regionEn: "Wales",
    latitude: 51.48,
    longitude: -3.18,
    fallback: {
      airTemperature: 17.1, humidity: 80, windSpeed: 25.3, windDirection: 252,
      waveHeight: 1.26, wavePeriod: 5.9, waterTemperature: 15.7, seaLevel: 0.41,
      currentVelocity: 1.3, currentDirection: 112, weatherCode: 80, tideTrend: "falling",
    },
  },
  {
    id: "uk_bangor_ni",
    nameZh: "班戈",
    nameEn: "Bangor",
    regionZh: "北爱尔兰",
    regionEn: "Northern Ireland",
    latitude: 54.66079,
    longitude: -5.66802,
    fallback: {
      airTemperature: 15.8, humidity: 84, windSpeed: 31.7, windDirection: 206,
      waveHeight: 1.76, wavePeriod: 7.2, waterTemperature: 14.2, seaLevel: 0.29,
      currentVelocity: 1.5, currentDirection: 144, weatherCode: 51, tideTrend: "steady",
    },
  },
];

const RISK_COPY: Record<RiskName, { zh: string; en: string; actionZh: string; actionEn: string }> = {
  safe: { zh: "安全", en: "Low risk", actionZh: "暂无明显危险信号，继续监测。", actionEn: "No material hazard signal. Continue monitoring." },
  advisory: { zh: "注意", en: "Advisory", actionZh: "环境正在变化，建议关注后续更新。", actionEn: "Conditions are changing. Watch the next update." },
  warning: { zh: "警告", en: "Warning", actionZh: "高风险信号增强，避免靠近暴露岸线。", actionEn: "Elevated signals. Avoid exposed coastal edges." },
  critical: { zh: "严重", en: "Critical", actionZh: "多项危险条件叠加，请优先参考官方警报。", actionEn: "Multiple severe signals. Prioritise official alerts." },
};

const WEATHER_ZH: Record<number, string> = {
  0: "晴", 1: "大致晴朗", 2: "局部多云", 3: "阴",
  45: "雾", 48: "雾", 51: "毛毛雨", 53: "毛毛雨", 55: "毛毛雨",
  61: "小雨", 63: "中雨", 65: "大雨", 80: "阵雨", 81: "阵雨", 82: "强阵雨",
  95: "雷暴", 96: "雷暴", 99: "强雷暴",
};

const REASON_COPY: Record<string, { zh: string; en: string }> = {
  MODEL_LOW_RISK: { zh: "综合环境处于低风险区间", en: "Combined environment remains in the low-risk range" },
  WIND_SIGNAL: { zh: "风速是主要风险贡献因素", en: "Wind speed is a leading risk contributor" },
  WAVE_HEIGHT_SIGNAL: { zh: "当前浪高推动风险上升", en: "Wave height is increasing the estimated risk" },
  WAVE_PERIOD_SIGNAL: { zh: "浪周期增强了海况风险", en: "Wave period is strengthening the marine signal" },
  HUMIDITY_SIGNAL: { zh: "湿度变化参与当前判断", en: "Humidity contributes to the current classification" },
  WATER_TEMPERATURE_SIGNAL: { zh: "海表温度参与当前判断", en: "Sea-surface temperature contributes to the classification" },
  SEA_LEVEL_CONTEXT: { zh: "海平面高度提供潮位背景", en: "Sea level provides tidal context" },
  OCEAN_CURRENT_SIGNAL: { zh: "海流速度参与当前判断", en: "Ocean-current velocity contributes to the classification" },
  AIR_TEMPERATURE_SIGNAL: { zh: "气温参与当前判断", en: "Air temperature contributes to the classification" },
  TIME_OF_DAY_CONTEXT: { zh: "模型考虑当前时段", en: "The model accounts for time of day" },
  SEASONAL_CONTEXT: { zh: "模型考虑季节背景", en: "The model accounts for seasonal context" },
  LOCATION_CONTEXT: { zh: "模型考虑海岸地理差异", en: "The model accounts for coastal location" },
  MODEL_COMBINED_SIGNAL: { zh: "多项环境特征共同作用", en: "Multiple environmental features contribute" },
};

const PROBABILITY_LABELS: Array<{ name: RiskName; zh: string; en: string }> = [
  { name: "safe", zh: "安全", en: "Safe" },
  { name: "advisory", zh: "注意", en: "Advisory" },
  { name: "warning", zh: "警告", en: "Warning" },
  { name: "critical", zh: "严重", en: "Critical" },
];

const FEATURE_IMPORTANCE = [
  ["浪高", "Wave height", 100],
  ["风速", "Wind speed", 52],
  ["浪周期", "Wave period", 33],
  ["湿度", "Humidity", 11],
  ["海表温度", "Sea temperature", 9],
] as const;

const CONFUSION = [
  [8326, 2529, 74, 0],
  [223, 1642, 896, 71],
  [34, 294, 785, 281],
  [0, 15, 103, 513],
];

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tideTrend(payload: Record<string, unknown>): EnvironmentReading["tideTrend"] {
  const hourly = payload.hourly as { time?: unknown; sea_level_height_msl?: unknown } | undefined;
  const levels = Array.isArray(hourly?.sea_level_height_msl)
    ? hourly.sea_level_height_msl.filter((item): item is number => typeof item === "number")
    : [];
  if (levels.length < 2) return "unknown";
  const delta = levels[levels.length - 1] - levels[0];
  if (delta > 0.01) return "rising";
  if (delta < -0.01) return "falling";
  return "steady";
}

async function fetchEnvironment(coast: Coast, signal: AbortSignal): Promise<EnvironmentReading> {
  const common = `latitude=${coast.latitude}&longitude=${coast.longitude}&timezone=auto`;
  const weather = `https://api.open-meteo.com/v1/forecast?${common}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m`;
  const marine = `https://marine-api.open-meteo.com/v1/marine?${common}&current=wave_height,wave_period,sea_surface_temperature,sea_level_height_msl,ocean_current_velocity,ocean_current_direction&hourly=sea_level_height_msl&past_hours=1&forecast_hours=2`;
  const [weatherResponse, marineResponse] = await Promise.all([
    fetch(weather, { signal }),
    fetch(marine, { signal }),
  ]);
  if (!weatherResponse.ok || !marineResponse.ok) throw new Error("Live provider unavailable");
  const weatherPayload = await weatherResponse.json() as Record<string, unknown>;
  const marinePayload = await marineResponse.json() as Record<string, unknown>;
  const weatherCurrent = (weatherPayload.current ?? {}) as Record<string, unknown>;
  const marineCurrent = (marinePayload.current ?? {}) as Record<string, unknown>;
  return {
    airTemperature: number(weatherCurrent.temperature_2m),
    humidity: number(weatherCurrent.relative_humidity_2m),
    windSpeed: number(weatherCurrent.wind_speed_10m),
    windDirection: number(weatherCurrent.wind_direction_10m),
    weatherCode: number(weatherCurrent.weather_code),
    waveHeight: number(marineCurrent.wave_height),
    wavePeriod: number(marineCurrent.wave_period),
    waterTemperature: number(marineCurrent.sea_surface_temperature),
    seaLevel: number(marineCurrent.sea_level_height_msl),
    currentVelocity: number(marineCurrent.ocean_current_velocity),
    currentDirection: number(marineCurrent.ocean_current_direction),
    tideTrend: tideTrend(marinePayload),
  };
}

function formatValue(value: number | null, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function maxCell(matrix: number[][]) {
  return Math.max(...matrix.flat());
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("zh");
  const [coastId, setCoastId] = useState(COASTS[0].id);
  const [reading, setReading] = useState<EnvironmentReading>(COASTS[0].fallback);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const coast = COASTS.find((item) => item.id === coastId) ?? COASTS[0];
  const isZh = language === "zh";

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    let disposed = false;
    fetchEnvironment(coast, controller.signal)
      .then((nextReading) => {
        setReading(nextReading);
        setUpdatedAt(new Date());
        setDataState("live");
      })
      .catch(() => {
        if (!disposed) {
          setReading(coast.fallback);
          setUpdatedAt(new Date());
          setDataState("snapshot");
        }
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [coast, refreshKey]);

  const prediction = useMemo(
    () => predictRisk(reading, coast.latitude, coast.longitude, updatedAt ?? new Date()),
    [reading, coast, updatedAt],
  );
  const riskText = RISK_COPY[prediction.name];
  const riskPercent = Math.round(prediction.probability * 100);
  const statusLabel = dataState === "live"
    ? (isZh ? "实时数据" : "Live data")
    : dataState === "loading"
      ? (isZh ? "正在更新" : "Updating")
      : (isZh ? "研究快照" : "Research snapshot");

  const signalCards = [
    {
      key: "wave",
      code: "WV",
      label: isZh ? "有效浪高" : "Wave height",
      value: `${formatValue(reading.waveHeight)} m`,
      detail: `${isZh ? "周期" : "Period"} ${formatValue(reading.wavePeriod)} s`,
      meter: clamp(((reading.waveHeight ?? 0) / 4) * 100),
    },
    {
      key: "wind",
      code: "WD",
      label: isZh ? "海岸风速" : "Coastal wind",
      value: `${formatValue(reading.windSpeed)} km/h`,
      detail: `${isZh ? "风向" : "Direction"} ${formatValue(reading.windDirection, 0)}°`,
      meter: clamp(((reading.windSpeed ?? 0) / 65) * 100),
    },
    {
      key: "tide",
      code: "SL",
      label: isZh ? "模式海平面" : "Model sea level",
      value: `${formatValue(reading.seaLevel, 2)} m`,
      detail: reading.tideTrend === "rising"
        ? (isZh ? "趋势 · 上升" : "Trend · rising")
        : reading.tideTrend === "falling"
          ? (isZh ? "趋势 · 下降" : "Trend · falling")
          : (isZh ? "趋势 · 平稳" : "Trend · steady"),
      meter: clamp((((reading.seaLevel ?? -1) + 1) / 3) * 100),
    },
    {
      key: "current",
      code: "CR",
      label: isZh ? "海流速度" : "Ocean current",
      value: `${formatValue(reading.currentVelocity)} km/h`,
      detail: `${isZh ? "方向" : "Direction"} ${formatValue(reading.currentDirection, 0)}°`,
      meter: clamp(((reading.currentVelocity ?? 0) / 5) * 100),
    },
  ];

  return (
    <main className="app-shell" lang={isZh ? "zh-CN" : "en-GB"}>
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="CoastWatch ML home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>COASTWATCH</strong><small>UK · MACHINE LEARNING LAB</small></span>
        </a>
        <nav aria-label={isZh ? "主导航" : "Primary navigation"}>
          <a href="#overview">{isZh ? "实时监测" : "Live monitor"}</a>
          <a href="#performance">{isZh ? "模型表现" : "Model evidence"}</a>
          <a href="#method">{isZh ? "研究方法" : "Method"}</a>
        </nav>
        <div className="top-actions">
          <span className="prototype-badge"><i />{isZh ? "研究原型" : "Research prototype"}</span>
          <a className="admin-access" href="/admin/login">
            <span aria-hidden="true">◆</span>
            {isZh ? "管理后台" : "Admin console"}
          </a>
          <div className="language-switch" role="group" aria-label="Language">
            <button className={isZh ? "active" : ""} onClick={() => setLanguage("zh")} aria-pressed={isZh}>中</button>
            <button className={!isZh ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={!isZh}>EN</button>
          </div>
        </div>
      </header>

      <section className="overview section" id="overview">
        <div className="overview-heading">
          <div>
            <p className="kicker"><span>01</span>{isZh ? "英国海岸实时风险研究" : "UK COASTAL RISK, IN REAL TIME"}</p>
            <h1>{isZh ? "让危险海况，" : "See dangerous conditions"}<em>{isZh ? "更早被看见。" : "before they escalate."}</em></h1>
            <p className="lead">
              {isZh
                ? "模型学习两年、六个英国海岸的逐小时环境记录，并结合当前天气与海况，估计未来 6 小时的环境风险等级。"
                : "A model trained on two years of hourly records across six UK coasts combines live weather and marine conditions to estimate the next six hours of environmental risk."}
            </p>
          </div>
          <div className="location-control">
            <label htmlFor="coast-select">{isZh ? "监测海岸" : "Monitoring coast"}</label>
            <div className="select-wrap">
              <span className="location-pin" aria-hidden="true" />
              <select
                id="coast-select"
                value={coastId}
                onChange={(event) => {
                  setDataState("loading");
                  setCoastId(event.target.value);
                }}
              >
                {COASTS.map((item) => (
                  <option value={item.id} key={item.id}>
                    {isZh ? `${item.nameZh} · ${item.regionZh}` : `${item.nameEn} · ${item.regionEn}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="location-meta">
              <span>{coast.latitude.toFixed(4)}°N</span>
              <span>{Math.abs(coast.longitude).toFixed(4)}°{coast.longitude < 0 ? "W" : "E"}</span>
              <span className={`source-status ${dataState}`}><i />{statusLabel}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <article className={`risk-card risk-${prediction.name}`}>
            <div className="card-topline">
              <div><span>{isZh ? "机器学习风险评估" : "ML RISK ASSESSMENT"}</span><small>{MODEL_META.version}</small></div>
              <span className="horizon">{isZh ? "未来" : "NEXT"} <strong>6H</strong></span>
            </div>
            <div className="risk-main">
              <div
                className="risk-dial"
                style={{ background: `conic-gradient(var(--risk-color) ${riskPercent * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}
                aria-label={`${riskPercent}% ${isZh ? riskText.zh : riskText.en}`}
              >
                <div><strong>{riskPercent}</strong><span>%</span><small>{isZh ? "模型置信度" : "MODEL CONFIDENCE"}</small></div>
              </div>
              <div className="risk-verdict">
                <p>{isZh ? "当前预测等级" : "PREDICTED CLASS"}</p>
                <h2>{isZh ? riskText.zh : riskText.en}</h2>
                <span className="verdict-code">LEVEL 0{prediction.level} · {prediction.name.toUpperCase()}</span>
                <p className="risk-action">{isZh ? riskText.actionZh : riskText.actionEn}</p>
              </div>
            </div>
            <div className="probability-grid">
              {PROBABILITY_LABELS.map((item, index) => {
                const value = Math.round(prediction.probabilities[index] * 100);
                return (
                  <div className={`probability-item ${prediction.level === index ? "selected" : ""}`} key={item.name}>
                    <div><span>{isZh ? item.zh : item.en}</span><strong>{value}%</strong></div>
                    <div className="probability-track"><i style={{ width: `${Math.max(2, value)}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <div className="model-explanation">
              <span>{isZh ? "为什么得到这个结果" : "WHY THIS RESULT"}</span>
              <ul>
                {prediction.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{REASON_COPY[reason]?.[language] ?? reason}</li>
                ))}
              </ul>
            </div>
          </article>

          <aside className="context-panel">
            <div className="context-header">
              <div><span>{isZh ? "当前环境输入" : "CURRENT INPUTS"}</span><strong>{isZh ? coast.nameZh : coast.nameEn}</strong></div>
              <button
                type="button"
                onClick={() => {
                  setDataState("loading");
                  setRefreshKey((value) => value + 1);
                }}
                disabled={dataState === "loading"}
              >
                <span aria-hidden="true">↻</span>{isZh ? "刷新" : "Refresh"}
              </button>
            </div>
            <div className="weather-summary">
              <div className="weather-glyph" aria-hidden="true"><span /><i /></div>
              <div>
                <strong>{formatValue(reading.airTemperature)}°</strong>
                <span>{isZh ? (WEATHER_ZH[reading.weatherCode ?? -1] ?? "当前天气") : "Current weather"}</span>
              </div>
              <dl>
                <div><dt>{isZh ? "湿度" : "Humidity"}</dt><dd>{formatValue(reading.humidity, 0)}%</dd></div>
                <div><dt>{isZh ? "海温" : "Sea temp"}</dt><dd>{formatValue(reading.waterTemperature)}°C</dd></div>
              </dl>
            </div>
            <div className="signal-list">
              {signalCards.map((signal) => (
                <div className="signal-card" key={signal.key}>
                  <span className="signal-code">{signal.code}</span>
                  <div className="signal-copy"><small>{signal.label}</small><strong>{signal.value}</strong><span>{signal.detail}</span></div>
                  <div className="signal-meter" aria-hidden="true"><i style={{ height: `${Math.max(8, signal.meter)}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="freshness-row">
              <span><i />OPEN-METEO WEATHER + MARINE</span>
              <time>{updatedAt ? updatedAt.toLocaleTimeString(isZh ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</time>
            </div>
          </aside>
        </div>

        <div className="coast-strip" aria-label={isZh ? "训练海岸" : "Training coasts"}>
          {COASTS.map((item, index) => (
            <button
              className={item.id === coastId ? "active" : ""}
              key={item.id}
              onClick={() => {
                setDataState("loading");
                setCoastId(item.id);
              }}
            >
              <span>0{index + 1}</span>
              <div><strong>{isZh ? item.nameZh : item.nameEn}</strong><small>{isZh ? item.regionZh : item.regionEn}</small></div>
              <i />
            </button>
          ))}
        </div>

        <div className={`data-notice ${dataState}`} role="status">
          <span>{dataState === "snapshot" ? "!" : "i"}</span>
          <p>
            {dataState === "snapshot"
              ? (isZh ? "实时数据源暂时不可用，页面正在使用明确标记的研究快照；模型仍在本地运行。" : "The live provider is unavailable. This view uses a labelled research snapshot while the model continues to run locally.")
              : (isZh ? "实时环境数据仅用于研究模型输入；概率表示模型对预测类别的置信度，不是官方灾害发生概率。" : "Live environmental data are research inputs. The percentage is model confidence for the selected class—not an official disaster probability.")}
          </p>
        </div>
      </section>

      <section className="evidence section" id="performance">
        <div className="section-heading">
          <div><p className="kicker"><span>02</span>{isZh ? "初步模型证据" : "EARLY MODEL EVIDENCE"}</p><h2>{isZh ? "不隐藏结果，" : "Show the trade-off,"}<em>{isZh ? "也不夸大能力。" : "not just the headline."}</em></h2></div>
          <p>{isZh ? "首轮模型提高了高风险召回率，但整体 Macro-F1 尚未超过规则基线，因此当前只以旁路模式运行。" : "The first model improves high-risk recall, but its Macro-F1 has not beaten the rule baseline. It therefore remains in shadow mode."}</p>
        </div>

        <div className="metric-row">
          <article><span>{isZh ? "测试集高风险召回率" : "Test high-risk recall"}</span><strong>83.1<small>%</small></strong><p><i className="up" />{isZh ? "规则基线 61.0%" : "Rule baseline 61.0%"}</p></article>
          <article><span>{isZh ? "严重等级召回率" : "Critical-class recall"}</span><strong>81.3<small>%</small></strong><p><i className="up" />{isZh ? "规则基线 56.6%" : "Rule baseline 56.6%"}</p></article>
          <article><span>Macro-F1</span><strong>61.8<small>%</small></strong><p><i className="down" />{isZh ? "规则基线 71.6%" : "Rule baseline 71.6%"}</p></article>
          <article className="mode-card"><span>{isZh ? "部署决策" : "Deployment decision"}</span><strong>SHADOW</strong><p>{isZh ? "模型观察，不替代现场规则" : "Observe; never replace local rules"}</p></article>
        </div>

        <div className="evidence-grid">
          <article className="matrix-card">
            <div className="panel-title"><div><span>{isZh ? "测试集混淆矩阵" : "TEST CONFUSION MATRIX"}</span><h3>{isZh ? "四级风险分类" : "Four-class risk classification"}</h3></div><em>N = 15,786</em></div>
            <div className="matrix-wrap">
              <div className="matrix-axis axis-top">{isZh ? "预测类别 →" : "PREDICTED CLASS →"}</div>
              <div className="matrix-axis axis-left">{isZh ? "真实类别" : "ACTUAL"}</div>
              <div className="matrix-labels top-labels">{["S", "A", "W", "C"].map((label) => <span key={label}>{label}</span>)}</div>
              <div className="matrix-labels side-labels">{["S", "A", "W", "C"].map((label) => <span key={label}>{label}</span>)}</div>
              <div className="matrix">
                {CONFUSION.flatMap((row, rowIndex) => row.map((value, columnIndex) => (
                  <div
                    className={rowIndex === columnIndex ? "diagonal" : ""}
                    style={{ "--cell-alpha": Math.max(0.06, value / maxCell(CONFUSION)) } as CSSProperties}
                    key={`${rowIndex}-${columnIndex}`}
                  >{value.toLocaleString("en-GB")}</div>
                )))}
              </div>
            </div>
            <p className="panel-note">{isZh ? "对角线表示正确分类。模型对 Critical 的召回更高，但会把一部分低风险样本提前判为更高等级。" : "The diagonal shows correct classifications. Critical recall is higher, with more conservative false alarms on lower-risk samples."}</p>
          </article>

          <article className="importance-card">
            <div className="panel-title"><div><span>{isZh ? "模型解释" : "MODEL INTERPRETATION"}</span><h3>{isZh ? "首轮特征影响排序" : "Leading feature influence"}</h3></div><em>MEAN |COEF|</em></div>
            <div className="importance-list">
              {FEATURE_IMPORTANCE.map((feature, index) => (
                <div key={feature[0]}>
                  <span>0{index + 1}</span>
                  <strong>{isZh ? feature[0] : feature[1]}</strong>
                  <div><i style={{ width: `${feature[2]}%` }} /></div>
                  <em>{feature[2]}</em>
                </div>
              ))}
            </div>
            <div className="finding">
              <span>{isZh ? "初步发现" : "EARLY FINDING"}</span>
              <p>{isZh ? "浪高、风速和浪周期是当前逻辑回归中最主要的环境信号。下一轮将加入潮位变化和时间窗口特征。" : "Wave height, wind speed and wave period dominate the current logistic model. The next iteration adds tide deltas and temporal windows."}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="method section" id="method">
        <div className="section-heading method-heading">
          <div><p className="kicker"><span>03</span>{isZh ? "研究方法" : "RESEARCH METHOD"}</p><h2>{isZh ? "从历史证据，" : "From historical evidence"}<em>{isZh ? "到实时推理。" : "to live inference."}</em></h2></div>
          <p>{isZh ? "这是一条可重复、可审计的机器学习流水线，而不是网页中的随机分数。" : "A reproducible, auditable machine-learning pipeline—not a random score placed in a dashboard."}</p>
        </div>

        <div className="pipeline">
          {[
            ["01", isZh ? "历史数据" : "Historical data", "105,228", isZh ? "逐小时样本" : "hourly rows"],
            ["02", isZh ? "时间切分" : "Time split", "70 / 15 / 15", isZh ? "训练 · 验证 · 测试" : "train · validation · test"],
            ["03", isZh ? "风险模型" : "Risk model", "LOGREG", isZh ? "四级概率分类" : "four-class probabilities"],
            ["04", isZh ? "实时推理" : "Live inference", "6 H", isZh ? "预测时间范围" : "forecast horizon"],
          ].map((step, index) => (
            <article key={step[0]}>
              <span>{step[0]}</span><div><small>{step[1]}</small><strong>{step[2]}</strong><p>{step[3]}</p></div>
              {index < 3 && <i aria-hidden="true">→</i>}
            </article>
          ))}
        </div>

        <div className="research-grid">
          <article className="dataset-card">
            <div className="panel-title"><div><span>{isZh ? "训练数据范围" : "TRAINING COVERAGE"}</span><h3>{isZh ? "六个英国海岸 · 两年记录" : "Six UK coasts · two years"}</h3></div><em>2024—2025</em></div>
            <div className="dataset-stats">
              <div><strong>105,228</strong><span>{isZh ? "有效样本" : "valid rows"}</span></div>
              <div><strong>14</strong><span>{isZh ? "输入特征" : "input features"}</span></div>
              <div><strong>4</strong><span>{isZh ? "风险等级" : "risk classes"}</span></div>
              <div><strong>6h</strong><span>{isZh ? "边界隔离" : "split purge"}</span></div>
            </div>
            <ul className="dataset-list">
              <li><span>01</span>{isZh ? "Open-Meteo 历史天气重分析" : "Open-Meteo historical weather reanalysis"}</li>
              <li><span>02</span>{isZh ? "历史海况、波高、浪周期与海流" : "Historical marine, wave-period and current data"}</li>
              <li><span>03</span>{isZh ? "按地点分别进行时间切分，避免相邻小时随机泄漏" : "Per-location chronological split to avoid adjacent-hour leakage"}</li>
            </ul>
          </article>

          <article className="limitations-card">
            <div className="panel-title"><div><span>{isZh ? "已知问题" : "KNOWN LIMITATIONS"}</span><h3>{isZh ? "下一阶段研究问题" : "Questions for the next iteration"}</h3></div><em>OPEN</em></div>
            <ol>
              <li><span>01</span><div><strong>{isZh ? "标签仍是弱标签" : "Labels remain weak"}</strong><p>{isZh ? "需要引入英国官方沿海洪水警告和人工复核事件。" : "Add official UK coastal-flood warnings and reviewed events."}</p></div></li>
              <li><span>02</span><div><strong>{isZh ? "极端样本不足" : "Extreme events are scarce"}</strong><p>{isZh ? "扩大到 5—10 年，并研究类别不平衡处理。" : "Expand to 5–10 years and study class imbalance."}</p></div></li>
              <li><span>03</span><div><strong>{isZh ? "尚未建模时间窗口" : "Temporal windows are missing"}</strong><p>{isZh ? "比较 XGBoost、LSTM 与 TCN 的提前预警能力。" : "Compare XGBoost, LSTM and TCN for earlier warning."}</p></div></li>
              <li><span>04</span><div><strong>{isZh ? "概率需要校准" : "Probabilities need calibration"}</strong><p>{isZh ? "使用 Brier Score 与可靠性曲线验证置信度。" : "Validate confidence with Brier score and reliability curves."}</p></div></li>
            </ol>
          </article>
        </div>
      </section>

      <section className="safety-note section">
        <span className="safety-icon">!</span>
        <div><strong>{isZh ? "研究原型 · 非官方公共预警" : "RESEARCH PROTOTYPE · NOT AN OFFICIAL PUBLIC WARNING"}</strong><p>{isZh ? "本网站展示机器学习研究结果。模型使用弱标签并以旁路模式运行，不应作为疏散、救援、航行或个人安全决策的唯一依据。发生危险时，请遵循英国官方机构和当地应急部门的指引。" : "This site presents machine-learning research. The weak-labelled model runs in shadow mode and must not be the sole basis for evacuation, rescue, navigation or personal-safety decisions. Follow official UK and local emergency guidance."}</p></div>
      </section>

      <footer className="footer section">
        <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span><strong>COASTWATCH</strong><small>UK · MACHINE LEARNING LAB</small></span></div>
        <p>{isZh ? "多源时序数据 · 可解释机器学习 · 实时海况" : "MULTI-SOURCE TIME SERIES · EXPLAINABLE ML · LIVE MARINE DATA"}</p>
        <a href="#overview">{isZh ? "返回顶部" : "Back to top"} ↑</a>
      </footer>
    </main>
  );
}
