Rally-diss
WRC Corner Performance Visualisation Tool

A client-side web application that visualises World Rally Championship (WRC) driver performance at a corner level, allowing users to compare how two drivers from different eras move through a specific rally stage section in real time.

Built as a BSc Software Engineering dissertation project at the University of Portsmouth - awarded 78% (First Class).


What It Does

Most publicly available WRC data is presented as static stage time tables. These tell you who was faster, but not where or how the time difference developed.

This tool addresses that gap. Rather than showing final results, it animates two drivers simultaneously through a selected corner or mini-sector, letting you watch the time gap open and close dynamically - the same way a pit wall analyst would think about a stage.

Key things you can observe:


Which driver pulls ahead through the corner and by how much
How the time delta changes at different points along the section
How performance approaches differ between historical and modern eras of WRC cars



Features


Animated top-down SVG visualisation of a rally stage section, with two drivers moving simultaneously along the path
Real-time time delta - the gap between the two drivers updates on every animation frame
Per-driver elapsed time counter, showing how far through their section time each driver is
Play, Pause, and Reset controls for full playback control
Playback speed selector - slow the animation down to study the gap more closely
Stage overview panel - shows the full stage with the selected corner highlighted for spatial context
Driver/era selection - switch between predefined driver and dataset combinations
Responsive layout - works from 768px width upwards
WCAG 2.1 AA accessibility - colour contrast ratios verified for all driver labels and UI elements



How It Works

Architecture

The app is entirely client-side - no backend, no server required beyond a basic development server to serve files. Everything runs in the browser.

There are three layers:

┌─────────────────────────────────┐
│        Presentation Layer        │  HTML structure, CSS styling, SVG canvas
├─────────────────────────────────┤
│       Application Logic Layer    │  JavaScript - data loading, animation, controls
├─────────────────────────────────┤
│           Data Layer             │  JSON files - stage geometry + driver timing
└─────────────────────────────────┘

Data

All stage and driver data is stored in external JSON files and loaded at runtime via the Fetch API. This means new stages or drivers can be added by dropping in a new JSON file - no changes to the application code needed.

Two JSON files are used per comparison:

Stage geometry file - defines the shape of the stage section as coordinate points:

json{
  "stageName": "Monte Carlo - Turini mini-sector (1990 reference)",
  "stageLengthKm": 2.27,
  "stage": {
    "points": [
      { "x": 20, "y": 170 },
      { "x": 45, "y": 165 },
      { "x": 120, "y": 132 }
    ]
  },
  "corner": {
    "stagePointStartIndex": 4,
    "stagePointEndIndex": 14,
    "lengthMeters": 500
  }
}

Driver timing file - defines each driver's section time and visual properties:

json{
  "drivers": [
    {
      "id": "sainz1990",
      "name": "Carlos Sainz",
      "car": "Toyota Celica GT-Four (1990)",
      "cornerTimeSeconds": 18.4,
      "colour": "#E63946"
    }
  ]
}

A manifest file lists all available comparisons, which populates the driver selection dropdown on load.


Note on data accuracy: Detailed telemetry and GPS data is not publicly available for WRC. Timing values are derived proportionally from overall stage times using publicly available records from eWRC-results.com. The stage geometry is an abstracted representation, not an exact GPS trace. The tool is a proof-of-concept visualisation, not a precision simulation.



Animation

The animation runs on a requestAnimationFrame loop, which synchronises rendering to the browser's repaint cycle for smooth, consistent motion.

On each frame:


Wall-clock elapsed time is calculated from the animation start timestamp
Each driver's progress (0.0 → 1.0) is calculated by dividing elapsed time by their cornerTimeSeconds
Their position is interpolated along the SVG path based on that progress value
The time delta is recalculated as the difference between each driver's elapsed proportion of their section time
The SVG markers and UI counters are updated in place - no full redraw needed


javascriptconst progress1 = Math.min(elapsed / driver1.cornerTimeSeconds, 1);
const progress2 = Math.min(elapsed / driver2.cornerTimeSeconds, 1);

positionCar(cornerPath1, cornerLengthPx1, car1, progress1);
positionCar(cornerPath2, cornerLengthPx2, car2, progress2);

This approach means the faster driver naturally pulls ahead - their cornerTimeSeconds is lower, so they reach progress = 1.0 first.

Visualisation

The stage and corner are rendered using SVG (Scalable Vector Graphics) rather than HTML Canvas. SVG was chosen because:


Each element (path, driver marker, label) exists as a separate DOM node and can be updated individually without redrawing the whole scene
SVG scales cleanly at any resolution, keeping driving lines sharp on all screen sizes
CSS and JavaScript can target individual elements directly for animation and styling



Getting Started

Prerequisites

A local development server is required because the Fetch API is blocked by browser CORS policy when loading JSON files directly from the filesystem.

Any of the following work:

bash# Python (built-in)
python -m http.server 8000

# Node.js (if you have live-server installed)
npx live-server

# VS Code
# Install the "Live Server" extension and click "Go Live"

Running the App

bash# Clone the repository
git clone https://github.com/Jaker000/wrc-corner-visualisation.git
cd wrc-corner-visualisation

# Start a local server (e.g. Python)
python -m http.server 8000

# Open in your browser
http://localhost:8000

No build step, no dependencies to install - it's plain HTML, CSS, and JavaScript.


Browser Compatibility

BrowserStatusChrome 120+✅ Full supportFirefox 121+✅ Full supportSafari 17+⚠️ Requires a local server (Fetch blocks local files without one)


Project Structure

wrc-corner-visualisation/
│
├── index.html          # App entry point and layout
├── style.css           # Styling and responsive layout
├── app.js              # Core application logic and animation loop
│
└── data/
    ├── manifest.json   # Lists all available driver comparisons
    ├── monte_carlo_1990.json   # Historic era stage + driver data
    └── monte_carlo_2023.json   # Modern era stage + driver data


Background & Motivation

WRC performance data is publicly available but almost always presented in classification tables and split time lists. These formats are useful for final results but give very little insight into how time differences develop - particularly at the level of individual corners or technical sections, which is often where stage results are actually decided.

Tools like AWS F1 Insights have demonstrated the value of interactive, section-level performance visualisation in Formula 1. No equivalent exists for rallying using public data.

This project explores what that kind of analysis might look like for WRC, using simplified geometry and derived timing values to animate drivers through a corner and show the gap developing in real time.


Limitations


Stage geometry is abstracted, not GPS-accurate
Timing values are derived proportionally from stage times, not measured at the corner
Only two drivers can be compared simultaneously in the current version
Dataset is limited to a small number of predefined stage sections


These are all documented honestly in the dissertation and are appropriate for a proof-of-concept built by a single developer using only publicly available data.


Built With


JavaScript (vanilla, no frameworks) - application logic and animation
HTML5 - page structure
CSS3 - styling and responsive layout
SVG - stage and driver visualisation
Fetch API - runtime data loading
JSON - data schema for stage geometry and timing



Author

Jake Hele
BSc (Hons) Software Engineering - University of Portsmouth, 2026
