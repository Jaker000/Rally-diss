/**
 * ─────────────────────────────────────────────────
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
// All UI elements grabbed once on load to avoid repeated queries
// ═══════════════════════════════════════════════════════════

const stageSelect          = document.getElementById("stageSelect");
const driver1Select        = document.getElementById("driver1Select");
const driver2Select        = document.getElementById("driver2Select");
const speedMultiplierSelect = document.getElementById("speedMultiplier");

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

const cornerSvg = document.getElementById("cornerSvg");
const stageSvg  = document.getElementById("stageSvg");

const trackMarker = document.getElementById("trackMarker");
const trackLabel  = document.querySelector(".track-label");

/** SVG namespace required for all createElementNS calls */
const SVG_NS = "http://www.w3.org/2000/svg";

// ═══════════════════════════════════════════════════════════
// APPLICATION STATE
// Central mutable state for loaded data and animation
// ═══════════════════════════════════════════════════════════

/** Parsed manifest.json — lists available stage comparisons */
let manifest = null;

/** The currently active comparison object from the manifest */
let currentComparison = null;

/**
 * Merged stage dataset built from the historic + modern JSON files.
 * Combines geometry (from historic) with both drivers' timing.
 */
let combinedStage = null;

// Animation state
let animationFrameId = null; // ID returned by requestAnimationFrame, used to cancel
let isPlaying        = false; // Guard to prevent double-starting the animation loop
let animationStart   = null;  // Timestamp (ms) when the current play segment started
let pausedElapsed    = 0;     // Accumulated elapsed seconds before the last pause

// SVG path references — set during buildVisualisation(), used in animate()
let cornerPath1     = null; // SVG <path> for driver 1's driving line
let cornerPath2     = null; // SVG <path> for driver 2's driving line
let car1            = null; // SVG <g> marker element for driver 1
let car2            = null; // SVG <g> marker element for driver 2
let cornerLengthPx1 = 0;   // Total pixel length of driver 1's path (for progress mapping)
let cornerLengthPx2 = 0;   // Total pixel length of driver 2's path (for progress mapping)

/** Fixed colour palette — consistent across all comparisons */
const DRIVER_COLOURS = {
  one: "#00d9ff", // Cyan   — driver 1
  two: "#ffd34d"  // Amber  — driver 2
};

// ═══════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════

// Kick off the async initialisation chain on page load
init();

/**
 * Initialises the application.
 * Loads the manifest, populates the stage selector, loads the first
 * comparison, and attaches all event listeners.
 */
async function init() {
  await loadManifest();
  populateStageSelect();

  // Auto-load the first available comparison so the page isn't empty on arrival
  if (manifest.comparisons.length > 0) {
    await loadComparison(manifest.comparisons[0]);
  }

  bindEvents();
}

// ═══════════════════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════════════════

/**
 * Attaches all interactive event listeners.
 * Called once during init() after the DOM and data are ready.
 */
function bindEvents() {
  // Stage selector — reloads both JSON files and rebuilds the visualisation
  stageSelect.addEventListener("change", async (e) => {
    const comparison = manifest.comparisons.find(c => c.label === e.target.value);
    if (comparison) await loadComparison(comparison);
  });

  // Driver selectors — changing either driver updates the legend and redraws
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

  // Playback control buttons
  playBtn.addEventListener("click",  startAnimation);
  pauseBtn.addEventListener("click", pauseAnimation);
  resetBtn.addEventListener("click", resetAnimation);
}

// ═══════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════

/**
 * Fetches and parses the manifest.json file.
 * The manifest lists available stage comparisons and their data file paths.
 * Stores the result in the global `manifest` variable.
 */
async function loadManifest() {
  const response = await fetch("data/manifest.json");
  manifest = await response.json();
}

/**
 * Populates the stage <select> element from the loaded manifest.
 * Each comparison entry becomes one <option>.
 */
function populateStageSelect() {
  stageSelect.innerHTML = "";
  manifest.comparisons.forEach((comparison) => {
    const option = document.createElement("option");
    option.value       = comparison.label;
    option.textContent = comparison.label;
    stageSelect.appendChild(option);
  });
}

/**
 * Loads both the historic and modern JSON files for a given comparison,
 * merges them into `combinedStage`, and rebuilds the UI.
 *
 * @param {Object} comparison — a comparison entry from manifest.comparisons
 */
async function loadComparison(comparison) {
  currentComparison = comparison;

  // Fetch both era files in parallel would be more efficient, but sequential
  // fetching is used here for simplicity and clarity in a proof-of-concept context
  const historicRes = await fetch(`data/${comparison.historicFile}`);
  const modernRes   = await fetch(`data/${comparison.modernFile}`);

  const historicStage = await historicRes.json();
  const modernStage   = await modernRes.json();

  // Merge: use the historic file's stage geometry (both eras share the same track),
  // but pull one driver from each file so both eras are represented
  combinedStage = {
    stageName:      comparison.label,
    source:         "Historic and modern Monte Carlo stage data based on publicly available rally results. Mini-sector values are derived for proof-of-concept use.",
    stage:          historicStage.stage,         // shared coordinate geometry
    corner:         historicStage.corner,        // shared corner metadata
    trackReference: historicStage.trackReference, // marker position on reference image
    drivers: [
      historicStage.drivers[0], // e.g. Sainz 1990
      modernStage.drivers[0]    // e.g. Ogier 2023
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

/**
 * Populates both driver <select> elements from `combinedStage.drivers`.
 * Sets driver1 to the first driver and driver2 to the second by default.
 */
function populateDriverSelects() {
  const drivers = combinedStage.drivers;

  driver1Select.innerHTML = "";
  driver2Select.innerHTML = "";

  drivers.forEach((driver, index) => {
    // Each driver appears in both dropdowns so users can choose any pairing
    const option1 = document.createElement("option");
    option1.value       = driver.id;
    option1.textContent = `${driver.name} (${driver.era})`;
    driver1Select.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value       = driver.id;
    option2.textContent = `${driver.name} (${driver.era})`;
    driver2Select.appendChild(option2);

    // Default: driver 1 picks the first entry, driver 2 picks the second
    if (index === 0) driver1Select.value = driver.id;
    if (index === 1) driver2Select.value = driver.id;
  });
}

/**
 * Updates the status panel text fields and the reference image marker position
 * from `combinedStage` metadata.
 */
function updateStageMeta() {
  stageNameText.textContent    = combinedStage.stageName;
  cornerLengthText.textContent = `${combinedStage.corner.lengthMeters} m`;
  sourceText.textContent       = combinedStage.source;

  // Position the red marker dot on the Turini reference image
  if (combinedStage.trackReference) {
    trackMarker.style.left = `${combinedStage.trackReference.markerXPercent}%`;
    trackMarker.style.top  = `${combinedStage.trackReference.markerYPercent}%`;

    // Offset the label slightly so it doesn't overlap the dot
    trackLabel.style.left = `calc(${combinedStage.trackReference.markerXPercent}% + 14px)`;
    trackLabel.style.top  = `calc(${combinedStage.trackReference.markerYPercent}% + 14px)`;
  }
}

/**
 * Looks up a driver object by ID from `combinedStage.drivers`.
 *
 * @param {string} driverId — the driver's id field
 * @returns {Object} the matching driver object
 */
function getSelectedDriver(driverId) {
  return combinedStage.drivers.find((d) => d.id === driverId);
}

/**
 * Updates the legend labels below the overview panel
 * to reflect the currently selected driver pair.
 */
function updateLegend() {
  const d1 = getSelectedDriver(driver1Select.value);
  const d2 = getSelectedDriver(driver2Select.value);

  legendDriver1.textContent = `${d1.name} (${d1.era})`;
  legendDriver2.textContent = `${d2.name} (${d2.era})`;
}

// ═══════════════════════════════════════════════════════════
// VISUALISATION — SVG RENDERING
// ═══════════════════════════════════════════════════════════

/**
 * Clears and redraws both SVG panels (stage overview + corner view).
 * Called on load and whenever the driver selection changes.
 */
function buildVisualisation() {
  clearSvg(cornerSvg);
  clearSvg(stageSvg);

  drawStageOverview();
  drawCornerView();
}

/**
 * Removes all child nodes from an SVG element.
 *
 * @param {SVGElement} svg — the SVG element to clear
 */
function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

/**
 * Draws the stage overview SVG.
 * Renders the full stage path in grey with the selected corner
 * section highlighted in orange so users can see where the
 * animated corner sits within the full stage.
 */
function drawStageOverview() {
  const points      = combinedStage.stage.points;
  const cornerStart = combinedStage.corner.stagePointStartIndex;
  const cornerEnd   = combinedStage.corner.stagePointEndIndex;

  // Scale all points to fit within the 300×220 viewBox with 20px padding
  const padded = fitPointsToBox(points, 300, 220, 20);

  // Full stage path in muted grey
  const stagePath = createPolylinePath(padded);
  stagePath.setAttribute("stroke",           "#7b7b7b");
  stagePath.setAttribute("stroke-width",     "6");
  stagePath.setAttribute("fill",             "none");
  stagePath.setAttribute("stroke-linecap",   "round");
  stagePath.setAttribute("stroke-linejoin",  "round");
  stageSvg.appendChild(stagePath);

  // Highlighted mini-sector in orange — sliced from the full padded array
  const cornerPoints  = padded.slice(cornerStart, cornerEnd + 1);
  const highlightPath = createPolylinePath(cornerPoints);
  highlightPath.setAttribute("stroke",           "#ff7f50");
  highlightPath.setAttribute("stroke-width",     "8");
  highlightPath.setAttribute("fill",             "none");
  highlightPath.setAttribute("stroke-linecap",   "round");
  highlightPath.setAttribute("stroke-linejoin",  "round");
  stageSvg.appendChild(highlightPath);
}

/**
 * Draws the main corner view SVG.
 * Layers from bottom to top:
 *   1. Road surface (wide grey stroke)
 *   2. Road edge guide (dashed grey)
 *   3. Centre line (dashed white)       ← added for road realism
 *   4. Driver 1 racing line (cyan)
 *   5. Driver 2 racing line (amber)
 *   6. Car marker for driver 1
 *   7. Car marker for driver 2
 *
 * Also stores path length references used by the animation loop
 * to map progress (0–1) to a pixel distance along each path.
 */
function drawCornerView() {
  // Extract just the corner slice from the full stage point array
  const rawCornerPoints = combinedStage.stage.points.slice(
    combinedStage.corner.stagePointStartIndex,
    combinedStage.corner.stagePointEndIndex + 1
  );

  // Scale corner points to the 900×520 viewBox with 70px padding
  const fittedCornerPoints = fitPointsToBox(rawCornerPoints, 900, 520, 70);

  // ── Layer 1: Road surface ──────────────────────────────────────────────────
  // Wide stroke simulates a road surface; no fill needed since SVG paths have none
  const roadBase = createPolylinePath(fittedCornerPoints);
  roadBase.setAttribute("stroke",          "#5c5c5c");
  roadBase.setAttribute("stroke-width",    "110");
  roadBase.setAttribute("fill",            "none");
  roadBase.setAttribute("stroke-linecap",  "round");
  roadBase.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(roadBase);

  // ── Layer 2: Road edge guide ───────────────────────────────────────────────
  // Thin dashed stroke along the same path gives a road-edge visual cue
  const roadEdge = createPolylinePath(fittedCornerPoints);
  roadEdge.setAttribute("stroke",           "#8a8a8a");
  roadEdge.setAttribute("stroke-width",     "10");
  roadEdge.setAttribute("fill",             "none");
  roadEdge.setAttribute("stroke-linecap",   "round");
  roadEdge.setAttribute("stroke-linejoin",  "round");
  roadEdge.setAttribute("stroke-dasharray", "14 10");
  cornerSvg.appendChild(roadEdge);

  // ── Layer 3: Centre line ───────────────────────────────────────────────────
  // A dashed white line down the middle of the road surface.
  // Uses the same base path as the road surface at zero offset.
  // Opacity is reduced so it reads as a road marking rather than a driver line.
  const centreLine = createPolylinePath(fittedCornerPoints);
  centreLine.setAttribute("stroke",           "#ffffff");
  centreLine.setAttribute("stroke-width",     "2.5");
  centreLine.setAttribute("fill",             "none");
  centreLine.setAttribute("stroke-linecap",   "round");
  centreLine.setAttribute("stroke-dasharray", "18 14"); // dash 18px, gap 14px
  centreLine.setAttribute("opacity",          "0.4");
  cornerSvg.appendChild(centreLine);

  // ── Layers 4 & 5: Driving lines ───────────────────────────────────────────
  // Each driver has a slightly offset line based on their lineStyle property,
  // simulating realistic corner entry/apex/exit differences
  const driver1 = getSelectedDriver(driver1Select.value);
  const driver2 = getSelectedDriver(driver2Select.value);

  const line1Points = createDrivingLine(fittedCornerPoints, driver1.lineStyle);
  const line2Points = createDrivingLine(fittedCornerPoints, driver2.lineStyle);

  cornerPath1 = createPolylinePath(line1Points);
  cornerPath1.setAttribute("stroke",          DRIVER_COLOURS.one);
  cornerPath1.setAttribute("stroke-width",    "5");
  cornerPath1.setAttribute("fill",            "none");
  cornerPath1.setAttribute("stroke-linecap",  "round");
  cornerPath1.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(cornerPath1);

  cornerPath2 = createPolylinePath(line2Points);
  cornerPath2.setAttribute("stroke",          DRIVER_COLOURS.two);
  cornerPath2.setAttribute("stroke-width",    "5");
  cornerPath2.setAttribute("fill",            "none");
  cornerPath2.setAttribute("stroke-linecap",  "round");
  cornerPath2.setAttribute("stroke-linejoin", "round");
  cornerSvg.appendChild(cornerPath2);

  // ── Layers 6 & 7: Car markers ─────────────────────────────────────────────
  // Small rounded rectangles that travel along each driving line during animation
  car1 = createCarMarker(DRIVER_COLOURS.one);
  car2 = createCarMarker(DRIVER_COLOURS.two);
  cornerSvg.appendChild(car1);
  cornerSvg.appendChild(car2);

  // Store total path lengths — used in positionCar() to convert a 0–1 progress
  // value into an actual pixel distance along the SVG path element
  cornerLengthPx1 = cornerPath1.getTotalLength();
  cornerLengthPx2 = cornerPath2.getTotalLength();
}

/**
 * Generates an offset driving line from the base corner points.
 * The offset direction is perpendicular to the path at each point,
 * allowing different driving styles (wide entry, late apex, neutral)
 * to be represented visually.
 *
 * @param {Array<{x: number, y: number}>} points — base corner coordinates
 * @param {string} style — "wide_entry" | "late_apex" | any other string (neutral)
 * @returns {Array<{x: number, y: number}>} offset points for the driving line
 */
function createDrivingLine(points, style) {
  return points.map((point, index) => {
    // Approximate the tangent direction using the neighbouring points
    const prev = points[Math.max(index - 1, 0)];
    const next = points[Math.min(index + 1, points.length - 1)];

    const dx     = next.x - prev.x;
    const dy     = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;

    // Normal vector (perpendicular to the tangent) used for lateral offset
    const nx = -dy / length;
    const ny =  dx / length;

    // t represents position along the corner (0 = entry, 1 = exit)
    const t = index / (points.length - 1);
    let offset = 0;

    if (style === "wide_entry") {
      // Wide entry: driver uses the full width on entry, cuts to apex, exits wide
      if      (t < 0.35) offset =  18;  // wide on entry
      else if (t < 0.65) offset = -10;  // tight at apex
      else               offset =   8;  // medium on exit
    } else if (style === "late_apex") {
      // Late apex: driver stays tight on entry, apexes late, opens out on exit
      if      (t < 0.35) offset = -12; // tight entry
      else if (t < 0.70) offset =  16; // late apex (wide)
      else               offset =  -6; // controlled exit
    } else {
      offset = 0; // neutral/centre line
    }

    return {
      x: point.x + nx * offset,
      y: point.y + ny * offset
    };
  });
}

// ═══════════════════════════════════════════════════════════
// SVG ELEMENT FACTORIES
// ═══════════════════════════════════════════════════════════

/**
 * Creates an SVG <path> element from an array of {x, y} points.
 * Uses M (move-to) for the first point and L (line-to) for the rest.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {SVGPathElement}
 */
function createPolylinePath(points) {
  const path = document.createElementNS(SVG_NS, "path");
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  path.setAttribute("d", d);
  return path;
}

/**
 * Creates an SVG <g> group containing a rounded rectangle,
 * used as a car marker that travels along a driver's path.
 *
 * @param {string} colour — fill colour for the car rectangle
 * @returns {SVGGElement} group element centred at (0, 0), positioned via transform
 */
function createCarMarker(colour) {
  const group = document.createElementNS(SVG_NS, "g");
  const rect  = document.createElementNS(SVG_NS, "rect");

  // Centred at (0,0) — position is applied via transform="translate(x, y)"
  rect.setAttribute("x",            "-10");
  rect.setAttribute("y",            "-6");
  rect.setAttribute("width",        "20");
  rect.setAttribute("height",       "12");
  rect.setAttribute("rx",           "3");
  rect.setAttribute("ry",           "3");
  rect.setAttribute("fill",         colour);
  rect.setAttribute("stroke",       "#081018");
  rect.setAttribute("stroke-width", "1.5");

  group.appendChild(rect);
  return group;
}

// ═══════════════════════════════════════════════════════════
// GEOMETRY UTILITIES
// ═══════════════════════════════════════════════════════════

/**
 * Scales and translates an array of {x, y} points to fit within a
 * bounding box of (width × height) with uniform padding on all sides.
 * Maintains aspect ratio by using the smaller of the two scale factors.
 *
 * @param {Array<{x: number, y: number}>} points — original coordinate data
 * @param {number} width   — target width  (SVG viewBox width)
 * @param {number} height  — target height (SVG viewBox height)
 * @param {number} padding — uniform padding in px on all sides
 * @returns {Array<{x: number, y: number}>} scaled and translated points
 */
function fitPointsToBox(points, width, height, padding) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const sourceWidth  = Math.max(maxX - minX, 1); // guard against zero-width input
  const sourceHeight = Math.max(maxY - minY, 1);

  // Uniform scale factor — use whichever axis is the tighter constraint
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

/**
 * Starts or resumes the animation loop.
 * Guards against double-starting with the `isPlaying` flag.
 * Resuming from pause works because `pausedElapsed` retains the
 * position at which play was paused.
 */
function startAnimation() {
  if (isPlaying) return; // prevent duplicate animation loops
  isPlaying      = true;
  animationStart = null; // reset so animate() recalculates start offset
  animationFrameId = requestAnimationFrame(animate);
}

/**
 * Pauses the animation by cancelling the active requestAnimationFrame.
 * `pausedElapsed` is not reset here, so play() can resume from this point.
 */
function pauseAnimation() {
  isPlaying = false;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * Stops the animation and returns both drivers to the start of the path.
 * Also resets all status panel text to initial values.
 */
function resetAnimation() {
  pauseAnimation();
  pausedElapsed = 0; // clear accumulated time so next play() starts from 0

  // Reset status panel displays
  elapsedTimeText.textContent = "0.00 s";
  gapText.textContent         = "0.00 s";
  distanceText.textContent    = "0.0 m";

  // Move both car markers back to position 0 on their respective paths
  if (cornerPath1 && cornerPath2 && car1 && car2) {
    positionCar(cornerPath1, cornerLengthPx1, car1, 0);
    positionCar(cornerPath2, cornerLengthPx2, car2, 0);
  }
}

// ═══════════════════════════════════════════════════════════
// ANIMATION — FRAME LOOP
// ═══════════════════════════════════════════════════════════

/**
 * Core animation frame callback — called by requestAnimationFrame on each repaint.
 *
 * Calculates elapsed time (accounting for playback speed and resume offset),
 * maps each driver to a 0–1 progress value along their path,
 * updates car positions and status panel values, and schedules the next frame
 * until both drivers have completed the section.
 *
 * @param {DOMHighResTimeStamp} timestamp — provided by requestAnimationFrame
 */
function animate(timestamp) {
  if (!isPlaying) return; // safety check in case of race condition

  const playbackSpeed = parseFloat(speedMultiplierSelect.value);

  // On the first frame of a new play segment, set the logical start time.
  // The offset accounts for any time already elapsed before a previous pause.
  if (animationStart === null) {
    animationStart = timestamp - (pausedElapsed * 1000 / playbackSpeed);
  }

  // Convert wall-clock ms into simulation seconds, scaled by playback speed
  const elapsed = ((timestamp - animationStart) / 1000) * playbackSpeed;
  pausedElapsed = elapsed; // keep in sync so pause/resume works correctly

  const driver1 = getSelectedDriver(driver1Select.value);
  const driver2 = getSelectedDriver(driver2Select.value);

  const d1Time = driver1.cornerTimeSeconds;
  const d2Time = driver2.cornerTimeSeconds;

  // Progress is clamped to [0, 1] — drivers stop at the end of their section
  const progress1 = Math.min(elapsed / d1Time, 1);
  const progress2 = Math.min(elapsed / d2Time, 1);

  // Move car markers to their new positions
  positionCar(cornerPath1, cornerLengthPx1, car1, progress1);
  positionCar(cornerPath2, cornerLengthPx2, car2, progress2);

  // ── Status panel updates ──────────────────────────────────────────────────

  // Elapsed time shown stops at the slower driver's finish time
  const shownElapsed = Math.min(elapsed, Math.max(d1Time, d2Time));

  // Gap: difference between the two drivers' current elapsed times.
  // Once a driver finishes, their time is capped at their total section time.
  const gap = Math.abs(
    (elapsed > d1Time ? d1Time : elapsed) -
    (elapsed > d2Time ? d2Time : elapsed)
  );

  // Distance is based on driver 1's progress through the stated section length
  const distance = progress1 * combinedStage.corner.lengthMeters;

  elapsedTimeText.textContent = `${shownElapsed.toFixed(2)} s`;
  gapText.textContent         = `${gap.toFixed(2)} s`;
  distanceText.textContent    = `${distance.toFixed(1)} m`;

  // Continue loop until both drivers have reached the end of the section
  if (progress1 < 1 || progress2 < 1) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    isPlaying = false; // animation complete — no further frames needed
  }
}

/**
 * Moves a car marker to the correct position and angle along its SVG path.
 *
 * Uses the browser's built-in getPointAtLength() to get an exact coordinate,
 * then calculates the heading angle from the point just ahead on the path
 * so the marker always faces the direction of travel.
 *
 * @param {SVGPathElement} path       — the path the car travels along
 * @param {number}         pathLength — total length of the path in px
 * @param {SVGGElement}    car        — the car marker group element
 * @param {number}         progress   — position along the path, 0 (start) to 1 (end)
 */
function positionCar(path, pathLength, car, progress) {
  const pointAt  = path.getPointAtLength(pathLength * progress);

  // Look 1px ahead to determine the direction of travel for rotation
  const aheadAt  = path.getPointAtLength(Math.min(pathLength, pathLength * progress + 1));
  const angle    = Math.atan2(aheadAt.y - pointAt.y, aheadAt.x - pointAt.x) * 180 / Math.PI;

  car.setAttribute("transform", `translate(${pointAt.x}, ${pointAt.y}) rotate(${angle})`);
}