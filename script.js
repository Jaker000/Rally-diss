/**
 * Entry point for the proof-of-concept rally animation tool.
 * Handles data loading, SVG rendering, and animation logic
 * entirely client-side using vanilla JavaScript.
 *
 * Architecture: Data → Application Logic → Presentation
 *   Data:        Fetched from JSON files via the Fetch API
 *   Logic:       Driver timing, path interpolation, delta calculation
 *   Presentation HTML/CSS layout + SVG rendering + animation loop
 */

// ═══════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════

const stageSelect           = document.getElementById("stageSelect");
const driver1Select         = document.getElementById("driver1Select");
const driver2Select         = document.getElementById("driver2Select");
const speedMultiplierSelect = document.getElementById("speedMultiplier");
const scrubber              = document.getElementById("scrubber");

const playBtn  = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

const stageNameText    = document.getElementById("stageName");
const cornerLengthText = document.getElementById("cornerLengthText");
const elapsedTimeText  = document.getElementById("elapsedTimeText");
const gapText          = document.getElementById("gapText");
const distanceText     = document.getElementById("distanceText");
const sourceText       = document.getElementById("sourceText");

const legendDriver1 = document.getElementById("legendDriver1");
const legendDriver2 = document.getElementById("legendDriver2");

const cornerSvg   = document.getElementById("cornerSvg");
const stageSvg    = document.getElementById("stageSvg");
const gapChartSvg = document.getElementById("gapChartSvg");

const trackMarker         = document.getElementById("trackMarker");
const trackLabel          = document.querySelector(".track-label");
const trackReferenceImage = document.getElementById("trackReferenceImage");
const trackImagePanel     = document.querySelector(".track-image-panel");
const trackImageTitle     = document.getElementById("trackImageTitle");

/** SVG namespace required for all createElementNS calls */
const SVG_NS = "http://www.w3.org/2000/svg";

// ═══════════════════════════════════════════════════════════
// APPLICATION STATE
// ═══════════════════════════════════════════════════════════

let manifest          = null;
let currentComparison = null;
let combinedStage     = null;

// Animation state
let animationFrameId = null;
let isPlaying        = false;
let animationStart   = null;
let pausedElapsed    = 0;

// SVG path and marker references — set during buildVisualisation()
let cornerPath1     = null;
let cornerPath2     = null;
let car1            = null;
let car2            = null;
let cornerLengthPx1 = 0;
let cornerLengthPx2 = 0;
let gapPlayhead     = null; // vertical playhead line in the gap chart

/** Fixed colour palette */
const DRIVER_COLOURS = {
  one: "#00d9ff", // Cyan  — driver 1
  two: "#ffd34d"  // Amber — driver 2
};

// Gap chart geometry constants (viewBox "0 0 880 70")
const CHART_PAD_LEFT  = 10;
const CHART_PAD_RIGHT = 100;
const CHART_TOTAL_W   = 880;
const CHART_H         = 70;
const CHART_AREA_END  = CHART_TOTAL_W - CHART_PAD_RIGHT; // 780
const CHART_CENTER_Y  = CHART_H / 2;                     // 35
const MAX_GAP_DISPLAY = 5; // seconds — visual scale ceiling

// ═══════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════

init();

async function init() {
  await loadManifest();
  populateStageSelect();
  if (manifest.comparisons.length > 0) {
    await loadComparison(manifest.comparisons[0]);
  }
  bindEvents();
}

// ═══════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════

function bindEvents() {
  stageSelect.addEventListener("change", async (e) => {
    const comparison = manifest.comparisons.find(c => c.label === e.target.value);
    if (comparison) await loadComparison(comparison);
  });

  driver1Select.addEventListener("change", () => {
    updateLegend();
    buildVisualisation();
    resetAnimation();
  });

  driver2Select.addEventListener("change", () => {
    updateLegend();
    buildVisualisation();
    resetAnimation();
  });

  playBtn.addEventListener("click",  startAnimation);
  pauseBtn.addEventListener("click", pauseAnimation);
  resetBtn.addEventListener("click", resetAnimation);

  // Scrubber — drag to seek anywhere in the section
  scrubber.addEventListener("input", () => {
    const d1      = getSelectedDriver(driver1Select.value);
    const d2      = getSelectedDriver(driver2Select.value);
    const maxTime = Math.max(d1.cornerTimeSeconds, d2.cornerTimeSeconds);
    pauseAnimation();
    pausedElapsed = (parseFloat(scrubber.value) / 100) * maxTime;
    applyFrame(pausedElapsed, d1, d2);
  });

  // Keyboard shortcuts — Space: play/pause, R: reset
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      isPlaying ? pauseAnimation() : startAnimation();
    } else if (e.key === "r" || e.key === "R") {
      resetAnimation();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════

async function loadManifest() {
  const response = await fetch("data/manifest.json");
  manifest = await response.json();
}

function populateStageSelect() {
  stageSelect.innerHTML = "";
  manifest.comparisons.forEach((comparison) => {
    const option       = document.createElement("option");
    option.value       = comparison.label;
    option.textContent = comparison.label;
    stageSelect.appendChild(option);
  });
}

async function loadComparison(comparison) {
  currentComparison = comparison;

  // Fetch both era files in parallel
  const [historicRes, modernRes] = await Promise.all([
    fetch(`data/${comparison.historicFile}`),
    fetch(`data/${comparison.modernFile}`)
  ]);

  const historicStage = await historicRes.json();
  const modernStage   = await modernRes.json();

  combinedStage = {
    stageName:       comparison.label,
    source:          historicStage.source || "Data based on publicly available rally results.",
    stage:           historicStage.stage,
    corner:          historicStage.corner,
    trackReference:  historicStage.trackReference,
    stageImage:      historicStage.stageImage      || null,
    stageImageAlt:   historicStage.stageImageAlt   || null,
    stageImageTitle: historicStage.stageImageTitle || null,
    drivers: [
      historicStage.drivers[0],
      modernStage.drivers[0]
    ]
  };

  populateDriverSelects();
  updateStageMeta();
  buildVisualisation();
  updateLegend();
  resetAnimation();
}

// ═══════════════════════════════════════════════════════════
// UI STATE UPDATES
// ═══════════════════════════════════════════════════════════

function populateDriverSelects() {
  const drivers = combinedStage.drivers;

  driver1Select.innerHTML = "";
  driver2Select.innerHTML = "";

  drivers.forEach((driver, index) => {
    const option1       = document.createElement("option");
    option1.value       = driver.id;
    option1.textContent = `${driver.name} (${driver.era})`;
    driver1Select.appendChild(option1);

    const option2       = document.createElement("option");
    option2.value       = driver.id;
    option2.textContent = `${driver.name} (${driver.era})`;
    driver2Select.appendChild(option2);

    if (index === 0) driver1Select.value = driver.id;
    if (index === 1) driver2Select.value = driver.id;
  });
}

function updateStageMeta() {
  stageNameText.textContent    = combinedStage.stageName;
  cornerLengthText.textContent = `${combinedStage.corner.lengthMeters} m`;
  sourceText.textContent       = combinedStage.source;

  // Show the route reference image only when a stageImage path is defined
  if (combinedStage.stageImage) {
    trackImagePanel.style.display    = "";
    trackReferenceImage.src          = combinedStage.stageImage;
    trackReferenceImage.alt          = combinedStage.stageImageAlt || "Stage route overview";
    trackImageTitle.textContent      = combinedStage.stageImageTitle || "Stage route reference";

    if (combinedStage.trackReference) {
      trackMarker.style.left = `${combinedStage.trackReference.markerXPercent}%`;
      trackMarker.style.top  = `${combinedStage.trackReference.markerYPercent}%`;
      trackLabel.style.left  = `calc(${combinedStage.trackReference.markerXPercent}% + 14px)`;
      trackLabel.style.top   = `calc(${combinedStage.trackReference.markerYPercent}% + 14px)`;
    }
  } else {
    trackImagePanel.style.display = "none";
  }
}

function getSelectedDriver(driverId) {
  return combinedStage.drivers.find((d) => d.id === driverId);
}

function updateLegend() {
  const d1 = getSelectedDriver(driver1Select.value);
  const d2 = getSelectedDriver(driver2Select.value);

  legendDriver1.textContent = `${d1.name} (${d1.era})`;
  legendDriver2.textContent = `${d2.name} (${d2.era})`;
}

// ═══════════════════════════════════════════════════════════
// VISUALISATION — SVG RENDERING
// ═══════════════════════════════════════════════════════════

function buildVisualisation() {
  clearSvg(cornerSvg);
  clearSvg(stageSvg);
  clearSvg(gapChartSvg);

  drawStageOverview();
  drawCornerView();
  drawGapChart();
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function drawStageOverview() {
  const points      = combinedStage.stage.points;
  const cornerStart = combinedStage.corner.stagePointStartIndex;
  const cornerEnd   = combinedStage.corner.stagePointEndIndex;

  const padded = fitPointsToBox(points, 300, 220, 20);

  const stagePath = createPolylinePath(padded);
  stagePath.setAttribute("stroke",          "#7b7b7b");
  stagePath.setAttribute("stroke-width",    "6");
  stagePath.setAttribute("fill",            "none");
  stagePath.setAttribute("stroke-linecap",  "round");
  stagePath.setAttribute("stroke-linejoin", "round");
  stageSvg.appendChild(stagePath);

  const cornerPoints  = padded.slice(cornerStart, cornerEnd + 1);
  const highlightPath = createPolylinePath(cornerPoints);
  highlightPath.setAttribute("stroke",          "#ff7f50");
  highlightPath.setAttribute("stroke-width",    "8");
  highlightPath.setAttribute("fill",            "none");
  highlightPath.setAttribute("stroke-linecap",  "round");
  highlightPath.setAttribute("stroke-linejoin", "round");
  stageSvg.appendChild(highlightPath);
}

function drawCornerView() {
  const rawCornerPoints = combinedStage.stage.points.slice(
    combinedStage.corner.stagePointStartIndex,
    combinedStage.corner.stagePointEndIndex + 1
  );
  const fittedCornerPoints = fitPointsToBox(rawCornerPoints, 900, 520, 70);

  // Layer 1: Road surface
  const roadBase = createPolylinePath(fittedCornerPoints);
  roadBase.setAttribute("stroke",          "#5c5c5c");
  roadBase.setAttribute("stroke-width",    "110");
  roadBase.setAttribute("fill",            "none");
  roadBase.setAttribute("stroke-linecap",  "round");
  roadBase.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(roadBase);

  // Layer 2: Road edge guide
  const roadEdge = createPolylinePath(fittedCornerPoints);
  roadEdge.setAttribute("stroke",           "#8a8a8a");
  roadEdge.setAttribute("stroke-width",     "10");
  roadEdge.setAttribute("fill",             "none");
  roadEdge.setAttribute("stroke-linecap",   "round");
  roadEdge.setAttribute("stroke-linejoin",  "round");
  roadEdge.setAttribute("stroke-dasharray", "14 10");
  cornerSvg.appendChild(roadEdge);

  // Layer 3: Centre line
  const centreLine = createPolylinePath(fittedCornerPoints);
  centreLine.setAttribute("stroke",           "#ffffff");
  centreLine.setAttribute("stroke-width",     "2.5");
  centreLine.setAttribute("fill",             "none");
  centreLine.setAttribute("stroke-linecap",   "round");
  centreLine.setAttribute("stroke-dasharray", "18 14");
  centreLine.setAttribute("opacity",          "0.4");
  cornerSvg.appendChild(centreLine);

  // Layers 4 & 5: Driving lines
  const driver1 = getSelectedDriver(driver1Select.value);
  const driver2 = getSelectedDriver(driver2Select.value);

  cornerPath1 = createPolylinePath(createDrivingLine(fittedCornerPoints, driver1.lineStyle));
  cornerPath1.setAttribute("stroke",          DRIVER_COLOURS.one);
  cornerPath1.setAttribute("stroke-width",    "5");
  cornerPath1.setAttribute("fill",            "none");
  cornerPath1.setAttribute("stroke-linecap",  "round");
  cornerPath1.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(cornerPath1);

  cornerPath2 = createPolylinePath(createDrivingLine(fittedCornerPoints, driver2.lineStyle));
  cornerPath2.setAttribute("stroke",          DRIVER_COLOURS.two);
  cornerPath2.setAttribute("stroke-width",    "5");
  cornerPath2.setAttribute("fill",            "none");
  cornerPath2.setAttribute("stroke-linecap",  "round");
  cornerPath2.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(cornerPath2);

  // Layers 6 & 7: Car markers with driver name labels
  const label1 = `${driver1.name.split(" ").pop()} '${driver1.era.slice(-2)}`;
  const label2 = `${driver2.name.split(" ").pop()} '${driver2.era.slice(-2)}`;

  car1 = createCarMarker(DRIVER_COLOURS.one, label1);
  car2 = createCarMarker(DRIVER_COLOURS.two, label2);
  cornerSvg.appendChild(car1);
  cornerSvg.appendChild(car2);

  cornerLengthPx1 = cornerPath1.getTotalLength();
  cornerLengthPx2 = cornerPath2.getTotalLength();
}

/**
 * Draws the time-gap chart below the corner view.
 * Shows the expected gap at each point in the section (pre-computed from timing data).
 * A vertical playhead line moves with the animation via updateGapPlayhead().
 */
function drawGapChart() {
  const d1 = getSelectedDriver(driver1Select.value);
  const d2 = getSelectedDriver(driver2Select.value);

  const gap      = Math.abs(d1.cornerTimeSeconds - d2.cornerTimeSeconds);
  const d1Faster = d1.cornerTimeSeconds < d2.cornerTimeSeconds;
  const sameTime = gap < 0.001;

  const maxDeltaY   = CHART_CENTER_Y - 8;
  const finalDeltaY = sameTime ? 0 : Math.min(gap / MAX_GAP_DISPLAY, 1) * maxDeltaY;
  const endX        = CHART_AREA_END;
  const endY        = d1Faster ? CHART_CENTER_Y - finalDeltaY : CHART_CENTER_Y + finalDeltaY;
  const fillColour  = d1Faster ? DRIVER_COLOURS.one : DRIVER_COLOURS.two;

  // Background
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", 0);            bg.setAttribute("y", 0);
  bg.setAttribute("width", CHART_TOTAL_W); bg.setAttribute("height", CHART_H);
  bg.setAttribute("fill", "#0e141b"); bg.setAttribute("rx", "8");
  gapChartSvg.appendChild(bg);

  // Filled area between the gap line and the neutral centre
  if (!sameTime) {
    const fill = document.createElementNS(SVG_NS, "polygon");
    fill.setAttribute("points",
      `${CHART_PAD_LEFT},${CHART_CENTER_Y} ${endX},${endY} ${endX},${CHART_CENTER_Y}`);
    fill.setAttribute("fill",    fillColour);
    fill.setAttribute("opacity", "0.15");
    gapChartSvg.appendChild(fill);
  }

  // Neutral (even) centre dashed line
  const neutralLine = document.createElementNS(SVG_NS, "line");
  neutralLine.setAttribute("x1", CHART_PAD_LEFT);   neutralLine.setAttribute("y1", CHART_CENTER_Y);
  neutralLine.setAttribute("x2", endX);             neutralLine.setAttribute("y2", CHART_CENTER_Y);
  neutralLine.setAttribute("stroke",           "#3a4a5a");
  neutralLine.setAttribute("stroke-width",     "1");
  neutralLine.setAttribute("stroke-dasharray", "4 4");
  gapChartSvg.appendChild(neutralLine);

  // Gap line
  const gapLine = document.createElementNS(SVG_NS, "line");
  gapLine.setAttribute("x1", CHART_PAD_LEFT);   gapLine.setAttribute("y1", CHART_CENTER_Y);
  gapLine.setAttribute("x2", endX);             gapLine.setAttribute("y2", endY);
  gapLine.setAttribute("stroke",       sameTime ? "#3a4a5a" : fillColour);
  gapLine.setAttribute("stroke-width", "2");
  gapChartSvg.appendChild(gapLine);

  // "Even" label at the start of the chart
  const evenLabel = document.createElementNS(SVG_NS, "text");
  evenLabel.setAttribute("x",           CHART_PAD_LEFT + 4);
  evenLabel.setAttribute("y",           CHART_CENTER_Y - 5);
  evenLabel.setAttribute("font-size",   "9");
  evenLabel.setAttribute("font-family", "Arial, sans-serif");
  evenLabel.setAttribute("fill",        "#5a6a7a");
  evenLabel.textContent = "Even";
  gapChartSvg.appendChild(evenLabel);

  // Leader name + gap value at the end of the chart
  if (!sameTime) {
    const leaderName = (d1Faster ? d1 : d2).name.split(" ").pop();

    const nameLabel = document.createElementNS(SVG_NS, "text");
    nameLabel.setAttribute("x",           endX + 6);
    nameLabel.setAttribute("y",           endY + 4);
    nameLabel.setAttribute("font-size",   "10");
    nameLabel.setAttribute("font-family", "Arial, sans-serif");
    nameLabel.setAttribute("font-weight", "700");
    nameLabel.setAttribute("fill",        fillColour);
    nameLabel.textContent = leaderName;
    gapChartSvg.appendChild(nameLabel);

    const gapLabel = document.createElementNS(SVG_NS, "text");
    gapLabel.setAttribute("x",           endX + 6);
    gapLabel.setAttribute("y",           endY + 17);
    gapLabel.setAttribute("font-size",   "9");
    gapLabel.setAttribute("font-family", "Arial, sans-serif");
    gapLabel.setAttribute("fill",        fillColour);
    gapLabel.textContent = `+${gap.toFixed(2)}s`;
    gapChartSvg.appendChild(gapLabel);
  }

  // Playhead — vertical line that tracks animation progress
  gapPlayhead = document.createElementNS(SVG_NS, "line");
  gapPlayhead.setAttribute("x1", CHART_PAD_LEFT); gapPlayhead.setAttribute("y1", 2);
  gapPlayhead.setAttribute("x2", CHART_PAD_LEFT); gapPlayhead.setAttribute("y2", CHART_H - 2);
  gapPlayhead.setAttribute("stroke",       "#ffffff");
  gapPlayhead.setAttribute("stroke-width", "1.5");
  gapPlayhead.setAttribute("opacity",      "0.55");
  gapChartSvg.appendChild(gapPlayhead);
}

/** Moves the gap chart playhead to reflect overall animation progress (0–1). */
function updateGapPlayhead(progress) {
  if (!gapPlayhead) return;
  const x = CHART_PAD_LEFT + (CHART_AREA_END - CHART_PAD_LEFT) * progress;
  gapPlayhead.setAttribute("x1", x);
  gapPlayhead.setAttribute("x2", x);
}

// ═══════════════════════════════════════════════════════════
// DRIVING LINE STYLES
// ═══════════════════════════════════════════════════════════

/**
 * Generates an offset driving line from the base corner points.
 * The offset is perpendicular to the path direction at each point,
 * producing the lateral variation that distinguishes different driving styles.
 *
 * Styles:
 *   wide_entry      — classic: wide entry, tight apex, medium exit
 *   late_apex       — tight entry, late apex, controlled exit
 *   trail_braking   — neutral entry, progressive tightening under braking, explosive exit
 *   aggressive_entry — hard early turn-in, early apex, runs wide on exit
 *
 * @param {Array<{x,y}>} points — base (fitted) corner coordinates
 * @param {string}       style  — line style identifier
 * @returns {Array<{x,y}>} laterally offset points
 */
function createDrivingLine(points, style) {
  return points.map((point, index) => {
    const prev = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];

    const dx     = next.x - prev.x;
    const dy     = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;

    const nx = -dy / length; // perpendicular normal
    const ny =  dx / length;

    const t = index / (points.length - 1); // 0 = entry, 1 = exit
    let offset = 0;

    if (style === "wide_entry") {
      if      (t < 0.35) offset =  18; // wide on entry
      else if (t < 0.65) offset = -10; // tight at apex
      else               offset =   8; // medium on exit
    } else if (style === "late_apex") {
      if      (t < 0.35) offset = -12; // tight entry
      else if (t < 0.70) offset =  16; // late apex (wide)
      else               offset =  -6; // controlled exit
    } else if (style === "trail_braking") {
      // Carries brake pressure into the corner; tightens progressively to a very late apex
      if      (t < 0.30) offset =   5; // slight wide on entry
      else if (t < 0.55) offset =  -8; // tightening under trail braking
      else if (t < 0.75) offset = -16; // very late tight apex
      else               offset =  10; // opens up aggressively on exit
    } else if (style === "aggressive_entry") {
      // Hard early turn-in and early apex; runs wide under power on exit
      if      (t < 0.25) offset = -16; // very tight early turn-in
      else if (t < 0.50) offset = -10; // early apex
      else if (t < 0.70) offset =   4; // slight correction
      else               offset =  12; // runs wide on exit
    }

    return { x: point.x + nx * offset, y: point.y + ny * offset };
  });
}

// ═══════════════════════════════════════════════════════════
// SVG ELEMENT FACTORIES
// ═══════════════════════════════════════════════════════════

function createPolylinePath(points) {
  const path = document.createElementNS(SVG_NS, "path");
  const d    = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  path.setAttribute("d", d);
  return path;
}

/**
 * Creates a car marker group: a rounded rectangle with a floating name label above it.
 *
 * @param {string} colour     — fill colour
 * @param {string} shortLabel — short driver name shown above the marker (e.g. "Ogier '23")
 * @returns {SVGGElement}
 */
function createCarMarker(colour, shortLabel) {
  const group = document.createElementNS(SVG_NS, "g");

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x",            "-10");
  rect.setAttribute("y",            "-6");
  rect.setAttribute("width",        "20");
  rect.setAttribute("height",       "12");
  rect.setAttribute("rx",           "3");
  rect.setAttribute("ry",           "3");
  rect.setAttribute("fill",         colour);
  rect.setAttribute("stroke",       "#081018");
  rect.setAttribute("stroke-width", "1.5");

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x",           "0");
  label.setAttribute("y",           "-11");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size",   "11");
  label.setAttribute("font-family", "Arial, sans-serif");
  label.setAttribute("font-weight", "700");
  label.setAttribute("fill",        colour);
  label.textContent = shortLabel;

  group.appendChild(rect);
  group.appendChild(label);
  return group;
}

// ═══════════════════════════════════════════════════════════
// GEOMETRY UTILITIES
// ═══════════════════════════════════════════════════════════

function fitPointsToBox(points, width, height, padding) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const sourceWidth  = Math.max(maxX - minX, 1);
  const sourceHeight = Math.max(maxY - minY, 1);

  const scale = Math.min(
    (width  - padding * 2) / sourceWidth,
    (height - padding * 2) / sourceHeight
  );

  return points.map((p) => ({
    x: (p.x - minX) * scale + padding,
    y: (p.y - minY) * scale + padding
  }));
}

// ═══════════════════════════════════════════════════════════
// ANIMATION — PLAYBACK CONTROL
// ═══════════════════════════════════════════════════════════

function startAnimation() {
  if (isPlaying) return;
  isPlaying        = true;
  animationStart   = null;
  animationFrameId = requestAnimationFrame(animate);
}

function pauseAnimation() {
  isPlaying = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function resetAnimation() {
  pauseAnimation();
  pausedElapsed = 0;

  elapsedTimeText.textContent = "0.00 s";
  gapText.textContent         = "0.00 s";
  distanceText.textContent    = "0.0 m";

  scrubber.value = 0;
  updateGapPlayhead(0);

  if (cornerPath1 && cornerPath2 && car1 && car2) {
    positionCar(cornerPath1, cornerLengthPx1, car1, 0);
    positionCar(cornerPath2, cornerLengthPx2, car2, 0);
  }
}

// ═══════════════════════════════════════════════════════════
// ANIMATION — FRAME UPDATE
// ═══════════════════════════════════════════════════════════

/**
 * Applies a single animation frame at the given elapsed time.
 * Shared by both the rAF loop and the scrubber input handler.
 *
 * @param {number} elapsed — simulation time in seconds
 * @param {Object} d1      — driver 1 data object
 * @param {Object} d2      — driver 2 data object
 */
function applyFrame(elapsed, d1, d2) {
  const d1Time = d1.cornerTimeSeconds;
  const d2Time = d2.cornerTimeSeconds;

  const progress1 = Math.min(elapsed / d1Time, 1);
  const progress2 = Math.min(elapsed / d2Time, 1);

  positionCar(cornerPath1, cornerLengthPx1, car1, progress1);
  positionCar(cornerPath2, cornerLengthPx2, car2, progress2);

  const shownElapsed = Math.min(elapsed, Math.max(d1Time, d2Time));
  const gap = Math.abs(
    (elapsed > d1Time ? d1Time : elapsed) -
    (elapsed > d2Time ? d2Time : elapsed)
  );
  const distance = progress1 * combinedStage.corner.lengthMeters;

  elapsedTimeText.textContent = `${shownElapsed.toFixed(2)} s`;
  gapText.textContent         = `${gap.toFixed(2)} s`;
  distanceText.textContent    = `${distance.toFixed(1)} m`;

  const overallProgress = Math.min(elapsed / Math.max(d1Time, d2Time), 1);
  updateGapPlayhead(overallProgress);
  scrubber.value = overallProgress * 100;
}

// ═══════════════════════════════════════════════════════════
// ANIMATION — FRAME LOOP
// ═══════════════════════════════════════════════════════════

function animate(timestamp) {
  if (!isPlaying) return;

  const playbackSpeed = parseFloat(speedMultiplierSelect.value);

  if (animationStart === null) {
    animationStart = timestamp - (pausedElapsed * 1000 / playbackSpeed);
  }

  const elapsed = ((timestamp - animationStart) / 1000) * playbackSpeed;
  pausedElapsed = elapsed;

  const driver1 = getSelectedDriver(driver1Select.value);
  const driver2 = getSelectedDriver(driver2Select.value);

  applyFrame(elapsed, driver1, driver2);

  const maxTime = Math.max(driver1.cornerTimeSeconds, driver2.cornerTimeSeconds);
  if (elapsed < maxTime) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    isPlaying = false;
  }
}

function positionCar(path, pathLength, car, progress) {
  const pointAt = path.getPointAtLength(pathLength * progress);
  const aheadAt = path.getPointAtLength(Math.min(pathLength, pathLength * progress + 1));
  const angle   = Math.atan2(aheadAt.y - pointAt.y, aheadAt.x - pointAt.x) * 180 / Math.PI;
  car.setAttribute("transform", `translate(${pointAt.x}, ${pointAt.y}) rotate(${angle})`);
}
