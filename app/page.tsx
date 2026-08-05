"use client";

import { useState } from "react";

type Language = "zh" | "en";

const copy = {
  zh: {
    nav: ["现有能力", "系统架构", "AI 路线图"],
    navCta: "查看系统",
    eyebrow: "AI 驱动的海岸安全 · 研究原型",
    headlineLead: "让海岸风险",
    headlineAccent: "更早被看见。",
    intro:
      "智岸 AI 融合设备端视觉感知、全球天气与海况数据，为海岸公共安全探索更及时、更透明的风险信息。",
    primaryCta: "探索系统",
    secondaryCta: "查看 AI 路线",
    proof: ["设备端推理", "隐私优先", "中英双语"],
    demoLabel: "AI 决策模拟 · 非实时数据",
    demoTitle: "可解释风险面板",
    demoRisk: "模拟风险",
    demoLevel: "关注",
    signals: [
      ["人体存在", "已检测", "视觉置信度 94%"],
      ["天气环境", "风力增强", "全球环境数据"],
      ["水位传感", "待接入", "多模态路线图"],
    ],
    reasoning: "人员存在 + 环境条件变化 → 建议提高现场关注",
    sectionKicker: "WHAT WORKS TODAY",
    sectionTitle: "已经落地的智能能力",
    sectionIntro:
      "先把真实可验证的能力做扎实，再让机器学习建立在可靠数据之上。",
    statusReady: "已实现",
    capabilityTitles: ["边缘视觉 AI", "环境智能终端", "安全数据网关"],
    capabilityBodies: [
      "OpenMV 在设备端运行量化 TFLite 人体存在模型，只传输存在状态与置信度；不上传图像，也不识别个人身份。",
      "ESP32-S3 驱动 800×480 触控屏，支持板上 Wi-Fi 配置、全球地点搜索，以及天气与海况信息显示。",
      "FastAPI 与 SQLite 提供带设备令牌的 HTTPS 网关，连接环境数据、设备状态和后续训练数据。",
    ],
    capabilityMeta: [
      ["OpenMV4 H7 Plus", "Quantized TFLite"],
      ["ESP32-S3", "800 × 480 Touch"],
      ["FastAPI", "Authenticated HTTPS"],
    ],
    architectureKicker: "LOCAL FIRST · AI ENHANCED",
    architectureTitle: "感知在边缘，理解在系统",
    architectureIntro:
      "基础判断优先留在现场。网络与 AI 用来补充上下文、记录证据并解释风险，而不是成为唯一安全决策者。",
    architectureNodes: [
      ["感知", "OpenMV 人体存在检测"],
      ["连接", "STM32 接口与 ESP32 通信"],
      ["理解", "天气、海况与数据服务"],
      ["响应", "现场显示与风险建议"],
    ],
    privacyTitle: "只判断是否有人，不判断他是谁",
    privacyBody:
      "摄像画面在 OpenMV 本地完成推理。系统设计目标是人员存在与风险区域检测，而非生物特征或身份识别。",
    roadmapKicker: "AI RISK FUSION ROADMAP",
    roadmapTitle: "从预训练推理，走向可验证的风险模型",
    roadmapIntro:
      "自定义模型不会凭空出现。我们将从采集、标注和规则基线开始，用真实实验数据逐步训练。",
    roadmapSteps: [
      ["01", "数据基础", "当前阶段", "时间对齐视觉状态、天气海况与设备事件，建立可追溯的数据集。"],
      ["02", "传感器扩展", "下一阶段", "接入真实水位传感器，验证水位变化与现场条件之间的关系。"],
      ["03", "风险分类模型", "训练规划", "以规则作为基线，训练并比较风险等级、概率与主要影响因素。"],
      ["04", "多端解释", "验证后", "将结果同步到网页和现场终端，生成中英双语风险说明。"],
    ],
    ukKicker: "BUILT FOR A CHANGING COAST",
    ukTitle: "面向英国展示，也面向全球海岸",
    ukBody:
      "从海滩、滨海步道到港口边缘，系统通过板上地点搜索适配不同地区，以低成本边缘感知探索更清晰的公共安全信息。",
    ukQuote: "See the risk before it reaches the shore.",
    disclaimerTitle: "研究原型",
    disclaimer:
      "智岸 AI 用于研究、教学与技术展示，并非经过认证的海岸安全设备。传感器、风险等级与 AI 输出不应作为疏散或救援决策的唯一依据。",
    footerLine: "边缘视觉 · 环境智能 · 可解释 AI",
  },
  en: {
    nav: ["Capabilities", "Architecture", "AI Roadmap"],
    navCta: "Explore",
    eyebrow: "AI-POWERED COASTAL SAFETY · RESEARCH PROTOTYPE",
    headlineLead: "See coastal risk",
    headlineAccent: "sooner.",
    intro:
      "AI Coastal Sentinel combines on-device vision with global weather and marine context to explore earlier, more transparent coastal risk information.",
    primaryCta: "Explore the system",
    secondaryCta: "View AI roadmap",
    proof: ["ON-DEVICE AI", "PRIVACY FIRST", "ZH / EN"],
    demoLabel: "AI DECISION SIMULATION · NOT LIVE DATA",
    demoTitle: "Explainable risk panel",
    demoRisk: "SIMULATED RISK",
    demoLevel: "WATCH",
    signals: [
      ["Person presence", "Detected", "Visual confidence 94%"],
      ["Weather context", "Wind increasing", "Global environment data"],
      ["Water-level sensor", "Not connected", "Multimodal roadmap"],
    ],
    reasoning: "Person present + changing conditions → increased site awareness",
    sectionKicker: "WHAT WORKS TODAY",
    sectionTitle: "Intelligence that already runs",
    sectionIntro:
      "We validate the real system first, then build machine learning on reliable evidence.",
    statusReady: "INTEGRATED",
    capabilityTitles: ["Edge Vision AI", "Environmental Terminal", "Secure Data Gateway"],
    capabilityBodies: [
      "OpenMV runs a quantized TFLite person-presence model at the edge. Only presence state and confidence are transmitted—no images, biometrics or identity recognition.",
      "An ESP32-S3 drives an 800×480 touch display with on-device Wi-Fi setup, global location search, weather and marine-condition views.",
      "FastAPI and SQLite provide a device-token protected HTTPS gateway for environmental context, device state and future training data.",
    ],
    capabilityMeta: [
      ["OpenMV4 H7 Plus", "Quantized TFLite"],
      ["ESP32-S3", "800 × 480 Touch"],
      ["FastAPI", "Authenticated HTTPS"],
    ],
    architectureKicker: "LOCAL FIRST · AI ENHANCED",
    architectureTitle: "Sense at the edge. Understand as a system.",
    architectureIntro:
      "Essential decisions remain local. Connectivity and AI add context, evidence and explanation instead of becoming the sole safety decision-maker.",
    architectureNodes: [
      ["SENSE", "OpenMV person-presence detection"],
      ["CONNECT", "STM32 interface and ESP32 connectivity"],
      ["UNDERSTAND", "Weather, marine and data services"],
      ["RESPOND", "On-site display and risk guidance"],
    ],
    privacyTitle: "Detect presence, never identity",
    privacyBody:
      "Camera inference stays on the OpenMV. The system is designed for presence and risk-zone awareness—not biometrics or personal identification.",
    roadmapKicker: "AI RISK FUSION ROADMAP",
    roadmapTitle: "From pretrained inference to a validated risk model",
    roadmapIntro:
      "A custom model needs evidence. We start with collection, labelling and an explainable rule baseline, then train on real experiments.",
    roadmapSteps: [
      ["01", "Data foundation", "CURRENT", "Time-align visual state, weather, marine context and device events into a traceable dataset."],
      ["02", "Sensor expansion", "NEXT", "Connect a real water-level sensor and validate its relationship with changing site conditions."],
      ["03", "Risk classifier", "TRAINING PLAN", "Benchmark against transparent rules, then evaluate risk levels, probability and contributing factors."],
      ["04", "Multi-device explanation", "AFTER VALIDATION", "Share verified output with the web and field display, including bilingual risk guidance."],
    ],
    ukKicker: "BUILT FOR A CHANGING COAST",
    ukTitle: "Designed for a UK demonstration. Adaptable worldwide.",
    ukBody:
      "From beaches and promenades to harbour fronts, on-device location search adapts the system to different regions while low-cost edge sensing explores clearer public-safety information.",
    ukQuote: "See the risk before it reaches the shore.",
    disclaimerTitle: "RESEARCH PROTOTYPE",
    disclaimer:
      "AI Coastal Sentinel is built for research, education and technical demonstration. It is not certified coastal safety equipment and must not be the sole basis for evacuation or rescue decisions.",
    footerLine: "Edge vision · Environmental intelligence · Explainable AI",
  },
} as const;

export default function Home() {
  const [language, setLanguage] = useState<Language>("zh");
  const t = copy[language];
  const isChinese = language === "zh";

  return (
    <main className="site-shell" lang={isChinese ? "zh-CN" : "en-GB"}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="AI Coastal Sentinel home">
          <span className="brand-orbit" aria-hidden="true"><span /></span>
          <span className="brand-copy">
            <strong>{isChinese ? "智岸 AI" : "COASTAL AI"}</strong>
            <small>AI COASTAL SENTINEL</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#capabilities">{t.nav[0]}</a>
          <a href="#architecture">{t.nav[1]}</a>
          <a href="#roadmap">{t.nav[2]}</a>
        </nav>
        <div className="topbar-actions">
          <div className="language-switch" role="group" aria-label="Language">
            <button
              type="button"
              className={isChinese ? "active" : ""}
              aria-pressed={isChinese}
              onClick={() => setLanguage("zh")}
            >
              中
            </button>
            <button
              type="button"
              className={!isChinese ? "active" : ""}
              aria-pressed={!isChinese}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
          </div>
          <a className="nav-cta" href="#capabilities">{t.navCta}</a>
        </div>
      </header>

      <section className="hero section" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span />{t.eyebrow}</p>
          <h1>
            <span>{t.headlineLead}</span>
            <em>{t.headlineAccent}</em>
          </h1>
          <p className="hero-intro">{t.intro}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#capabilities">{t.primaryCta}<span aria-hidden="true">↗</span></a>
            <a className="button button-secondary" href="#roadmap">{t.secondaryCta}<span aria-hidden="true">↓</span></a>
          </div>
          <div className="proof-row" aria-label="Project principles">
            {t.proof.map((item, index) => (
              <div className="proof-item" key={item}>
                <span>0{index + 1}</span>
                <strong>{item}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual" aria-label={t.demoTitle}>
          <div className="scanner-field" aria-hidden="true">
            <div className="scanner-line" />
            <span className="target target-one" />
            <span className="target target-two" />
          </div>
          <article className="decision-card">
            <div className="card-header">
              <div>
                <p>{t.demoLabel}</p>
                <h2>{t.demoTitle}</h2>
              </div>
              <span className="live-dot">SIM</span>
            </div>
            <div className="risk-summary">
              <div className="risk-ring" aria-label="68 percent simulated risk">
                <div><strong>68</strong><span>%</span></div>
              </div>
              <div className="risk-copy">
                <small>{t.demoRisk}</small>
                <strong>{t.demoLevel}</strong>
                <p>MODEL PIPELINE / v0.1</p>
              </div>
            </div>
            <div className="signal-stack">
              {t.signals.map((signal, index) => (
                <div className="signal-row" key={signal[0]}>
                  <span className={`signal-icon signal-${index + 1}`} aria-hidden="true" />
                  <div><small>{signal[0]}</small><strong>{signal[1]}</strong></div>
                  <em>{signal[2]}</em>
                </div>
              ))}
            </div>
            <div className="reasoning-trace">
              <span>AI REASONING TRACE</span>
              <p>{t.reasoning}</p>
            </div>
          </article>
          <div className="telemetry-tag tag-top"><span /> EDGE INFERENCE</div>
          <div className="telemetry-tag tag-bottom"><span /> PRIVACY-FIRST</div>
        </div>
      </section>

      <section className="capabilities section" id="capabilities">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{t.sectionKicker}</p>
            <h2>{t.sectionTitle}</h2>
          </div>
          <p>{t.sectionIntro}</p>
        </div>
        <div className="capability-grid">
          {t.capabilityTitles.map((title, index) => (
            <article className="capability-card" key={title}>
              <div className="capability-topline">
                <span>0{index + 1}</span>
                <em><i />{t.statusReady}</em>
              </div>
              <div className={`capability-graphic graphic-${index + 1}`} aria-hidden="true">
                <span /><span /><span />
              </div>
              <h3>{title}</h3>
              <p>{t.capabilityBodies[index]}</p>
              <div className="tech-tags">
                {t.capabilityMeta[index].map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="architecture section" id="architecture">
        <div className="architecture-copy">
          <p className="section-kicker">{t.architectureKicker}</p>
          <h2>{t.architectureTitle}</h2>
          <p>{t.architectureIntro}</p>
          <div className="privacy-note">
            <div className="privacy-mark" aria-hidden="true"><span /></div>
            <div><strong>{t.privacyTitle}</strong><p>{t.privacyBody}</p></div>
          </div>
        </div>
        <div className="system-flow" aria-label="System architecture">
          {t.architectureNodes.map((node, index) => (
            <div className="flow-node" key={node[0]}>
              <div className="flow-index">0{index + 1}</div>
              <div><small>{node[0]}</small><strong>{node[1]}</strong></div>
              {index < t.architectureNodes.length - 1 && <span className="flow-arrow" aria-hidden="true">→</span>}
            </div>
          ))}
          <div className="flow-caption"><span /> CAMERA → EDGE AI → DEVICE LINK → CONTEXT → RESPONSE</div>
        </div>
      </section>

      <section className="roadmap section" id="roadmap">
        <div className="roadmap-heading">
          <p className="section-kicker">{t.roadmapKicker}</p>
          <h2>{t.roadmapTitle}</h2>
          <p>{t.roadmapIntro}</p>
        </div>
        <div className="roadmap-list">
          {t.roadmapSteps.map((step, index) => (
            <article className="roadmap-row" key={step[0]}>
              <span className="roadmap-number">{step[0]}</span>
              <div className="roadmap-name"><h3>{step[1]}</h3><em>{step[2]}</em></div>
              <p>{step[3]}</p>
              <div className={`roadmap-state ${index === 0 ? "current" : "future"}`}><span /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="uk-context section">
        <div className="globe-grid" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
        </div>
        <div className="uk-copy">
          <p className="section-kicker">{t.ukKicker}</p>
          <h2>{t.ukTitle}</h2>
          <p>{t.ukBody}</p>
          <blockquote>{t.ukQuote}</blockquote>
        </div>
        <div className="coast-panel" aria-label="Global coast interface concept">
          <div className="coast-panel-head"><span>GLOBAL COAST INDEX</span><em>16 PRESETS · WORLD SEARCH</em></div>
          <div className="coast-map" aria-hidden="true">
            <span className="map-line line-one" /><span className="map-line line-two" />
            <i className="map-point point-one" /><i className="map-point point-two" /><i className="map-point point-three" />
          </div>
          <div className="coast-stats">
            <div><small>REGION</small><strong>UNITED KINGDOM</strong></div>
            <div><small>MODE</small><strong>COAST / PLACE</strong></div>
          </div>
        </div>
      </section>

      <section className="disclaimer section">
        <span className="disclaimer-index">!</span>
        <div><h2>{t.disclaimerTitle}</h2><p>{t.disclaimer}</p></div>
      </section>

      <footer className="footer section">
        <div className="brand footer-brand">
          <span className="brand-orbit" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>{isChinese ? "智岸 AI" : "COASTAL AI"}</strong><small>AI COASTAL SENTINEL</small></span>
        </div>
        <p>{t.footerLine}</p>
        <a href="#top">ashlxylock.uk <span aria-hidden="true">↑</span></a>
      </footer>
    </main>
  );
}
