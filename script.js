// script.js

// DOM elements
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

const driver1NameInput = document.getElementById("driver1Name");
const driver2NameInput = document.getElementById("driver2Name");
const cornerLengthInput = document.getElementById("cornerLength");
const driver1TimeInput = document.getElementById("driver1Time");
const driver2TimeInput = document.getElementById("driver2Time");

const timeDisplay = document.getElementById("timeDisplay");
const gapDisplay = document.getElementById("gapDisplay");
const distanceDisplay = document.getElementById("distanceDisplay");

const legendDriver1Text = document.getElementById("legendDriver1Text");
const legendDriver2Text = document.getElementById("legendDriver2Text");

const driver1Path = document.getElementById("driver1Path");
const driver2Path = document.getElementById("driver2Path");
const driver1Car = document.getElementById("driver1Car");
const driver2Car = document.getElementById("driver2Car");

// Path lengths
const driver1PathLength = driver1Path.getTotalLength();
const driver2PathLength = driver2Path.getTotalLength();

// Animation state
let startTimestamp = null;
let isPlaying = false;
let lastElapsed = 0; // seconds

// Convenience: read numeric input safely
function readNumber(input, fallback) {
  const v = parseFloat(input.value);
  return Number.isFinite(v) ? v : fallback;
}

// Update legend names when user edits
function syncLegendNames() {
  legendDriver1Text.textContent = driver1NameInput.value || "Driver 1";
  legendDriver2Text.textContent = driver2NameInput.value || "Driver 2";
}

driver1NameInput.addEventListener("input", syncLegendNames);
driver2NameInput.addEventListener("input", syncLegendNames);
syncLegendNames();

// Core animation loop
function animate(timestamp) {
  if (!isPlaying) return;

  if (!startTimestamp) {
    startTimestamp = timestamp - lastElapsed * 1000; // resume support
  }

  const elapsedMs = timestamp - startTimestamp;
  const elapsedSeconds = elapsedMs / 1000;
  lastElapsed = elapsedSeconds;

  const cornerLength = readNumber(cornerLengthInput, 150);
  const driver1CornerTime = readNumber(driver1TimeInput, 3.2);
  const driver2CornerTime = readNumber(driver2TimeInput, 3.6);

  // Clamp animation duration to the slower driver
  const totalDuration = Math.max(driver1CornerTime, driver2CornerTime);

  // Normalised progress for each driver (0 -> 1)
  const p1 = Math.min(elapsedSeconds / driver1CornerTime, 1);
  const p2 = Math.min(elapsedSeconds / driver2CornerTime, 1);

  // Distance along the corner (based on faster driver)
  const distance = Math.min(elapsedSeconds / driver1CornerTime, 1) * cornerLength;

  // Position the cars
  updateCarPosition(driver1Path, driver1PathLength, driver1Car, p1);
  updateCarPosition(driver2Path, driver2PathLength, driver2Car, p2);

  // Timing / gap display
  const d1TimeShown = Math.min(elapsedSeconds, driver1CornerTime);
  const d2TimeShown = Math.min(elapsedSeconds, driver2CornerTime);
  const gap = d2TimeShown - d1TimeShown;

  timeDisplay.textContent = d1TimeShown.toFixed(2);
  gapDisplay.textContent = gap.toFixed(2);
  distanceDisplay.textContent = distance.toFixed(1);

  if (elapsedSeconds < totalDuration) {
    requestAnimationFrame(animate);
  } else {
    // Animation complete
    isPlaying = false;
  }
}

function updateCarPosition(path, pathLength, carGroup, progress) {
  const lengthAtProgress = pathLength * progress;
  const point = path.getPointAtLength(lengthAtProgress);

  // Simple orientation approximation: sample a slightly-ahead point
  const ahead = path.getPointAtLength(
    Math.min(pathLength, lengthAtProgress + 1)
  );
  const angleRad = Math.atan2(ahead.y - point.y, ahead.x - point.x);
  const angleDeg = (angleRad * 180) / Math.PI;

  carGroup.setAttribute(
    "transform",
    `translate(${point.x}, ${point.y}) rotate(${angleDeg})`
  );
}

// Button handlers
playBtn.addEventListener("click", () => {
  if (!isPlaying) {
    isPlaying = true;
    startTimestamp = null;
    requestAnimationFrame(animate);
  }
});

pauseBtn.addEventListener("click", () => {
  isPlaying = false;
});

resetBtn.addEventListener("click", () => {
  isPlaying = false;
  startTimestamp = null;
  lastElapsed = 0;
  timeDisplay.textContent = "0.00";
  gapDisplay.textContent = "0.00";
  distanceDisplay.textContent = "0";
  // Reset cars to start of paths
  updateCarPosition(driver1Path, driver1PathLength, driver1Car, 0);
  updateCarPosition(driver2Path, driver2PathLength, driver2Car, 0);
});

// Initial positioning
updateCarPosition(driver1Path, driver1PathLength, driver1Car, 0);
updateCarPosition(driver2Path, driver2PathLength, driver2Car, 0);
