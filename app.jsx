const { useState, useEffect, useRef, useCallback } = React;

/* ============================== Weather code helpers ============================== */

// WMO weather codes used by Open-Meteo.
function getIconType(code, isDay) {
  if (code === 0) return isDay ? "clear-day" : "clear-night";
  if (code === 1 || code === 2) return isDay ? "partly-day" : "partly-night";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunder";
  return "cloudy";
}

function getConditionText(code) {
  const map = {
    0: "Clear",
    1: "Mostly Clear",
    2: "Partly Cloudy",
    3: "Cloudy",
    45: "Foggy",
    48: "Foggy",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    56: "Freezing Drizzle",
    57: "Freezing Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Rain Showers",
    81: "Rain Showers",
    82: "Violent Showers",
    85: "Snow Showers",
    86: "Snow Showers",
    95: "Thunderstorms",
    96: "Thunderstorms",
    99: "Thunderstorms",
  };
  return map[code] || "Unknown";
}

function windCompassLabel(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

/* ============================== Sky scenes ============================== */

/*
 * iOS changes the sky with the condition AND the time of day, so the scene is
 * keyed on both. Phase comes from the day's own sunrise/sunset rather than a
 * fixed clock hour, so it stays right at any latitude or season.
 */
function getPhase(nowIso, sunriseIso, sunsetIso, isDayFlag) {
  if (!nowIso || !sunriseIso || !sunsetIso) return isDayFlag ? "day" : "night";
  const now = new Date(nowIso).getTime();
  const rise = new Date(sunriseIso).getTime();
  const set = new Date(sunsetIso).getTime();
  if (isNaN(now) || isNaN(rise) || isNaN(set)) return isDayFlag ? "day" : "night";
  const HOUR = 3600000;
  if (now >= rise - HOUR && now < rise + HOUR) return "dawn";
  if (now >= set - 1.5 * HOUR && now < set + HOUR) return "dusk";
  return now >= rise && now < set ? "day" : "night";
}

/*
 * Dust concentration (ug/m3) at which the sky gets the dust treatment. The WHO
 * publishes no dust-specific band, so unlike the AQI cutoff these two numbers
 * are a judgement call, tuned to roughly "visibly dusty" and "dust storm".
 */
const DUST_VISIBLE = 50;
const DUST_HEAVY = 150;

/*
 * Condition families, coarser than the raw WMO codes because several codes want
 * the same sky.
 *
 * The WMO code set Open-Meteo returns has no dust or haze code at all, so those
 * two skies come from the air-quality endpoint plus visibility instead:
 *   dust  -- modelled surface dust above DUST_VISIBLE
 *   haze  -- US AQI past Moderate (>100), or visibility under 5 km
 * Both only apply when the sky is otherwise clear-to-overcast; actual rain, fog
 * or snow always wins, because those are reported facts rather than inferences.
 */
function getFamily(code, visibilityM, air) {
  if ([95, 96, 99].includes(code)) return "thunder";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([56, 57, 66, 67].includes(code)) return "sleet";
  if ([65, 82].includes(code)) return "heavyrain";
  if ([61, 63, 80, 81].includes(code)) return "rain";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if (code === 45 || code === 48) return "fog";

  if (code <= 3) {
    const dust = air && typeof air.dust === "number" ? air.dust : null;
    if (dust !== null && dust >= DUST_VISIBLE) return "dust";

    const aqi = air && typeof air.us_aqi === "number" ? air.us_aqi : null;
    const lowVis = typeof visibilityM === "number" && visibilityM > 0 && visibilityM < 5000;
    if ((aqi !== null && aqi > 100) || lowVis) return "haze";
  }

  if (code === 3) return "cloudy";
  if (code === 1 || code === 2) return "partly";
  return "clear";
}

// Three stops per sky: zenith, mid, horizon.
const SKY = {
  clear: {
    day: ["#1B6BC0", "#4A99DC", "#96C8EA"],
    night: ["#060B1E", "#0E1636", "#1B2550"],
    dawn: ["#2B3A6B", "#7E5C86", "#E8A07A"],
    dusk: ["#1F2E5C", "#6B4A7A", "#E0885F"],
  },
  partly: {
    day: ["#3D82C4", "#6BA3D4", "#A8C8DC"],
    night: ["#0E1533", "#1B2445", "#2A3358"],
    dawn: ["#33406A", "#7A6088", "#DB9C82"],
    dusk: ["#26315B", "#664B78", "#D68C69"],
  },
  cloudy: { day: ["#6E7681", "#8A929C", "#A6ACB4"], night: ["#171C24", "#242A33", "#333A43"] },
  fog: { day: ["#8A929A", "#A4AAB0", "#BFC4C8"], night: ["#21262C", "#2F353E", "#414850"] },
  haze: { day: ["#93866F", "#B0A288", "#CBBFA6"], night: ["#282420", "#38322A", "#494137"] },
  // Dust runs warmer and more orange than pollution haze.
  dust: { day: ["#A67C4E", "#C29A66", "#DCC08C"], night: ["#2E2318", "#402F20", "#53402C"] },
  drizzle: { day: ["#55636E", "#6D7B85", "#8B979F"], night: ["#131820", "#1E252D", "#2B333B"] },
  rain: { day: ["#3F4C58", "#55636E", "#717E88"], night: ["#0E131A", "#171E25", "#222A32"] },
  heavyrain: { day: ["#313C46", "#43505A", "#5C6A74"], night: ["#090D12", "#11171D", "#1A2128"] },
  thunder: { day: ["#2A303A", "#3A424D", "#4E5661"], night: ["#06090E", "#0D1219", "#151C24"] },
  snow: { day: ["#7A8592", "#98A2AD", "#C4CBD3"], night: ["#1B212A", "#28303A", "#39424D"] },
  sleet: { day: ["#4E5A66", "#67737D", "#87939B"], night: ["#101620", "#1B222A", "#272F38"] },
};

function sceneFor(code, phase, visibilityM, air) {
  const family = getFamily(code, visibilityM, air);
  const table = SKY[family] || SKY.cloudy;

  // Only clear/partly skies get dedicated dawn/dusk palettes. Under thick cloud
  // or rain the sunrise colour is muted, so those reuse the day sky and get a
  // warm wash layered over it instead of a whole separate gradient.
  let stops = table[phase];
  let warmWash = false;
  if (!stops) {
    stops = table.day;
    warmWash = phase === "dawn" || phase === "dusk";
  }

  // Thick dust gets a denser veil than merely dusty air.
  const dustHeavy =
    family === "dust" && air && typeof air.dust === "number" && air.dust >= DUST_HEAVY;

  return {
    family: family,
    phase: phase,
    warmWash: warmWash,
    dustHeavy: dustHeavy,
    topColor: stops[0],
    gradient:
      "linear-gradient(180deg, " + stops[0] + " 0%, " + stops[1] + " 55%, " + stops[2] + " 100%)",
  };
}

// How many of each particle the family gets, and how the sky is dressed.
const SCENE_EFFECTS = {
  clear: { drops: 0, flakes: 0, clouds: 0, luminary: true },
  partly: { drops: 0, flakes: 0, clouds: 3, luminary: true },
  cloudy: { drops: 0, flakes: 0, clouds: 6, luminary: false },
  fog: { drops: 0, flakes: 0, clouds: 0, luminary: false, fogBands: true },
  haze: { drops: 0, flakes: 0, clouds: 2, luminary: true, hazeWash: true },
  dust: { drops: 0, flakes: 0, clouds: 1, luminary: true, dustWash: true },
  drizzle: { drops: 18, flakes: 0, clouds: 5, luminary: false, dropSpeed: 1.3, dropLen: 10 },
  rain: { drops: 42, flakes: 0, clouds: 5, luminary: false, dropSpeed: 0.85, dropLen: 16 },
  heavyrain: { drops: 72, flakes: 0, clouds: 6, luminary: false, dropSpeed: 0.55, dropLen: 22, slant: true },
  thunder: { drops: 55, flakes: 0, clouds: 6, luminary: false, dropSpeed: 0.6, dropLen: 20, slant: true, lightning: true },
  snow: { drops: 0, flakes: 28, clouds: 4, luminary: false },
  sleet: { drops: 22, flakes: 14, clouds: 5, luminary: false, dropSpeed: 1.0, dropLen: 14 },
};

/* ============================== Icons (inline SVG) ============================== */

/*
 * These render as small as 26px in the hourly strip and the 10-day list, so the
 * shapes are deliberately chunky: a cloud built from overlapping circles reads
 * as a cloud at that size, where a single ellipse just reads as a blob.
 */
const SUN = "#FFB627";
const MOON = "#E9F0FA";
const CLOUD = "#FBFDFF";
const CLOUD_SHADE = "#C6D2E0";
const CLOUD_DARK = "#8C99A8";
const CLOUD_DARK_SHADE = "#6F7C8B";
const DROP = "#3FA0E8";
const FLAKE = "#EDF6FF";

// dy lifts the cloud to make room for falling precipitation underneath.
function Cloud({ dy = 0, fill = CLOUD, shade = CLOUD_SHADE }) {
  return (
    <g transform={"translate(0 " + dy + ")"}>
      {/* Offset underside gives the silhouette an edge on a pale panel. */}
      <rect x="22" y="63" width="56" height="15" rx="7.5" fill={shade} />
      <circle cx="36" cy="57" r="15" fill={fill} />
      <circle cx="55" cy="49" r="20" fill={fill} />
      <circle cx="71" cy="59" r="13" fill={fill} />
      <rect x="22" y="60" width="56" height="14" rx="7" fill={fill} />
    </g>
  );
}

function SunDisc({ cx, cy, r, rays }) {
  return (
    <g fill={SUN} stroke={SUN}>
      <circle cx={cx} cy={cy} r={r} strokeWidth="0" />
      {rays &&
        [...Array(8)].map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r + 7)}
              y1={cy + Math.sin(a) * (r + 7)}
              x2={cx + Math.cos(a) * (r + 16)}
              y2={cy + Math.sin(a) * (r + 16)}
              strokeWidth="6.5"
              strokeLinecap="round"
            />
          );
        })}
    </g>
  );
}

/*
 * A fixed crescent outline, scaled and positioned rather than recomputed.
 *
 * Two dead ends worth not repeating: describing the bite as a second circle and
 * relying on fill-rule="evenodd" fills the symmetric difference, so the part of
 * the bite hanging outside the moon gets painted too and it reads as a ring.
 * And deriving the two arcs from a radius is fragile -- when a radius is under
 * half its chord SVG quietly scales it up, both arcs collapse onto the same
 * semicircle, and the icon vanishes. This outline is known good; it spans
 * roughly a 60-unit circle centred at (50,49).
 */
const CRESCENT_D = "M62 20a32 32 0 1 0 18 58 26 26 0 0 1-18-58z";

function Crescent({ cx, cy, r }) {
  const k = r / 30;
  return (
    <g transform={"translate(" + cx + " " + cy + ") scale(" + k + ") translate(-50 -49)"}>
      <path d={CRESCENT_D} fill={MOON} />
    </g>
  );
}

function Drops({ long }) {
  return (
    <g stroke={DROP} strokeWidth={long ? 5.5 : 5} strokeLinecap="round">
      {[34, 50, 66].map((x, i) => (
        <line key={i} x1={x} y1={long ? 76 : 77} x2={x - (long ? 6 : 3)} y2={long ? 93 : 86} />
      ))}
    </g>
  );
}

function WeatherIcon({ type, size = 44 }) {
  const s = size;
  const box = { width: s, height: s, viewBox: "0 0 100 100" };

  switch (type) {
    case "clear-day":
      return (
        <svg {...box}>
          <SunDisc cx={50} cy={50} r={21} rays />
        </svg>
      );

    case "clear-night":
      return (
        <svg {...box}>
          <Crescent cx={48} cy={50} r={30} />
        </svg>
      );

    case "partly-day":
      return (
        <svg {...box}>
          <SunDisc cx={35} cy={32} r={14} rays />
          <Cloud dy={8} />
        </svg>
      );

    case "partly-night":
      return (
        <svg {...box}>
          <Crescent cx={36} cy={30} r={18} />
          <Cloud dy={8} />
        </svg>
      );

    case "cloudy":
      // A second cloud behind separates "overcast" from "partly" at a glance.
      return (
        <svg {...box}>
          <g transform="translate(-13 -14) scale(0.74)" opacity="0.85">
            <Cloud fill={CLOUD_SHADE} shade={CLOUD_DARK} />
          </g>
          <Cloud dy={4} />
        </svg>
      );

    case "fog":
      return (
        <svg {...box}>
          <Cloud dy={-14} />
          <g fill={CLOUD} stroke="none">
            <rect x="20" y="72" width="60" height="6" rx="3" />
            <rect x="30" y="86" width="44" height="6" rx="3" opacity="0.75" />
          </g>
        </svg>
      );

    case "drizzle":
      return (
        <svg {...box}>
          <Cloud dy={-14} />
          <Drops />
        </svg>
      );

    case "rain":
      return (
        <svg {...box}>
          <Cloud dy={-14} />
          <Drops long />
        </svg>
      );

    case "snow":
      return (
        <svg {...box}>
          <Cloud dy={-14} />
          <g fill={FLAKE}>
            {[34, 50, 66].map((x, i) => (
              <circle key={i} cx={x} cy={i === 1 ? 88 : 82} r="5" />
            ))}
          </g>
        </svg>
      );

    case "thunder":
      return (
        <svg {...box}>
          <Cloud dy={-16} fill={CLOUD_DARK} shade={CLOUD_DARK_SHADE} />
          <polygon points="53,56 38,82 50,82 44,99 68,70 54,70" fill={SUN} />
        </svg>
      );

    default:
      return null;
  }
}

/* ============================== Animated background scene ============================== */

function BackgroundScene({ scene }) {
  const family = scene.family;
  const phase = scene.phase;
  const fx = SCENE_EFFECTS[family] || SCENE_EFFECTS.cloudy;
  const isNight = phase === "night";
  const isTwilight = phase === "dawn" || phase === "dusk";

  /*
   * Particle positions are randomised once per mount and kept in a ref. Building
   * a fresh array on each render would hand React new inline styles every time
   * and restart the CSS animations, which reads as a stutter.
   */
  const pool = useRef(null);
  if (!pool.current) {
    pool.current = {
      drops: [...Array(72)].map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        jitter: 0.7 + Math.random() * 0.6,
        opacity: 0.35 + Math.random() * 0.4,
      })),
      flakes: [...Array(28)].map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 5 + Math.random() * 4,
        size: 3 + Math.random() * 4,
        drift: 12 + Math.random() * 30,
      })),
      clouds: [...Array(6)].map((_, i) => ({
        top: 4 + i * 11 + Math.random() * 5,
        width: 150 + Math.random() * 190,
        height: 42 + Math.random() * 36,
        duration: 46 + Math.random() * 55,
        delay: -Math.random() * 60,
        opacity: 0.1 + Math.random() * 0.16,
      })),
      stars: [...Array(40)].map(() => ({
        left: Math.random() * 100,
        top: Math.random() * 62,
        size: Math.random() < 0.75 ? 1.5 : 2.5,
        delay: Math.random() * 4,
      })),
    };
  }
  const p = pool.current;

  const drops = p.drops.slice(0, fx.drops || 0);
  const flakes = p.flakes.slice(0, fx.flakes || 0);
  const clouds = p.clouds.slice(0, fx.clouds || 0);

  return (
    <div className="bg-layer">
      {/* Stars only where the sky is actually open. */}
      {isNight && (family === "clear" || family === "partly") && (
        <div className="star-field">
          {p.stars.map((s, i) => (
            <div
              key={i}
              className="star"
              style={{
                left: s.left + "%",
                top: s.top + "%",
                width: s.size + "px",
                height: s.size + "px",
                animationDelay: s.delay + "s",
              }}
            />
          ))}
        </div>
      )}

      {/* Sun, moon, or a twilight glow low on the horizon. */}
      {fx.luminary && (
        <div
          className={
            "luminary " +
            (isNight ? "luminary-moon" : isTwilight ? "luminary-twilight" : "luminary-sun")
          }
        />
      )}

      {clouds.length > 0 && (
        <div className="cloud-layer">
          {clouds.map((c, i) => (
            <div
              key={i}
              className="cloud"
              style={{
                top: c.top + "%",
                width: c.width + "px",
                height: c.height + "px",
                opacity: c.opacity,
                animationDuration: c.duration + "s",
                animationDelay: c.delay + "s",
              }}
            />
          ))}
        </div>
      )}

      {fx.fogBands && (
        <div className="fog-layer">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="fog-band" style={{ top: 12 + i * 18 + "%", animationDelay: i * -7 + "s" }} />
          ))}
        </div>
      )}

      {drops.length > 0 && (
        <div className={"rain-layer" + (fx.slant ? " rain-slant" : "")}>
          {drops.map((d, i) => (
            <div
              key={i}
              className="drop"
              style={{
                left: d.left + "%",
                height: fx.dropLen + "px",
                opacity: d.opacity,
                animationDelay: d.delay + "s",
                animationDuration: fx.dropSpeed * d.jitter + "s",
              }}
            />
          ))}
        </div>
      )}

      {flakes.length > 0 && (
        <div className="snow-layer">
          {flakes.map((f, i) => (
            <div
              key={i}
              className="flake"
              style={{
                left: f.left + "%",
                width: f.size + "px",
                height: f.size + "px",
                animationDelay: f.delay + "s",
                animationDuration: f.duration + "s",
                "--drift": f.drift + "px",
              }}
            />
          ))}
        </div>
      )}

      {fx.hazeWash && <div className="haze-wash" />}
      {fx.dustWash && <div className={"dust-wash" + (scene.dustHeavy ? " dust-heavy" : "")} />}
      {scene.warmWash && <div className="warm-wash" />}
      {fx.lightning && <div className="lightning" />}
    </div>
  );
}

/* ============================== Data fetching ============================== */

async function fetchWeather(lat, lon, unit) {
  const tempUnit = unit === "F" ? "fahrenheit" : "celsius";
  const windUnit = unit === "F" ? "mph" : "kmh";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure` +
    `&hourly=temperature_2m,weather_code,precipitation_probability,is_day,uv_index,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max` +
    `&timezone=auto&forecast_days=10&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather request failed");
  return res.json();
}

/*
 * Air quality comes from a separate Open-Meteo endpoint (no key, no signup).
 * `dust` is a modelled surface dust concentration, which is what lets the app
 * tell a genuine dust haze apart from smoke/pollution haze.
 *
 * Returns null on failure -- air quality is a nice-to-have, so a failure here
 * must never stop the forecast rendering.
 */
async function fetchAirQuality(lat, lon) {
  try {
    const res = await fetch(
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
        `?latitude=${lat}&longitude=${lon}` +
        "&current=pm10,pm2_5,us_aqi,dust&timezone=auto"
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.current ? data.current : null;
  } catch {
    return null;
  }
}

// US EPA bands. Standard, published breakpoints -- not thresholds I chose.
function aqiBand(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50) return { label: "Good", short: "Good" };
  if (aqi <= 100) return { label: "Moderate", short: "Moderate" };
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", short: "Unhealthy (sensitive)" };
  if (aqi <= 200) return { label: "Unhealthy", short: "Unhealthy" };
  if (aqi <= 300) return { label: "Very unhealthy", short: "Very unhealthy" };
  return { label: "Hazardous", short: "Hazardous" };
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.city || data.locality || data.principalSubdivision || "Current Location";
  } catch {
    return "Current Location";
  }
}

async function searchPlaces(query) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

/* ============================== Small UI pieces ============================== */

function currentHourIndex(hourly, currentTime) {
  if (!hourly) return 0;
  const idx = hourly.time.findIndex((t) => t >= currentTime);
  return idx === -1 ? 0 : idx;
}

function HourlyPanel({ hourly, currentTime, unit }) {
  if (!hourly) return null;
  const startIdx = currentHourIndex(hourly, currentTime);
  const items = [];
  for (let i = startIdx; i < Math.min(startIdx + 24, hourly.time.length); i++) {
    items.push(i);
  }
  return (
    <div className="panel">
      <div className="panel-title">
        <span>24-Hour Forecast</span>
      </div>
      <div className="divider" />
      <div className="hourly-scroll">
        {items.map((i, pos) => {
          const date = new Date(hourly.time[i]);
          const label = pos === 0 ? "Now" : date.toLocaleTimeString([], { hour: "numeric" });
          const icon = getIconType(hourly.weather_code[i], hourly.is_day[i] === 1);
          const precip = hourly.precipitation_probability[i];
          return (
            <div className="hour-item" key={hourly.time[i]}>
              <div className="hour-label">{label}</div>
              <div className="hour-precip">{precip >= 15 ? `${precip}%` : ""}</div>
              <WeatherIcon type={icon} size={28} />
              <div className="hour-temp">{Math.round(hourly.temperature_2m[i])}°</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyPanel({ daily }) {
  if (!daily) return null;
  const allLows = daily.temperature_2m_min;
  const allHighs = daily.temperature_2m_max;
  const minOfAll = Math.min(...allLows);
  const maxOfAll = Math.max(...allHighs);
  const span = maxOfAll - minOfAll || 1;

  return (
    <div className="panel">
      <div className="panel-title">
        <span>10-Day Forecast</span>
      </div>
      <div className="divider" />
      {daily.time.map((t, i) => {
        const date = new Date(t + "T00:00:00");
        const dayName =
          i === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" });
        const icon = getIconType(daily.weather_code[i], true);
        const lo = Math.round(daily.temperature_2m_min[i]);
        const hi = Math.round(daily.temperature_2m_max[i]);
        const precip = daily.precipitation_probability_max[i];
        const leftPct = ((lo - minOfAll) / span) * 100;
        const widthPct = ((hi - lo) / span) * 100;
        return (
          <React.Fragment key={t}>
            <div className="day-row">
              <div className={`day-name ${i === 0 ? "day-today" : ""}`}>{dayName}</div>
              <WeatherIcon type={icon} size={26} />
              <div className="day-precip">{precip >= 15 ? `${precip}%` : ""}</div>
              <div className="day-lo">{lo}°</div>
              <div className="temp-bar-track">
                <div
                  className="temp-bar-fill"
                  style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 6)}%` }}
                />
              </div>
              <div className="day-hi">{hi}°</div>
              <span />
            </div>
            {i < daily.time.length - 1 && <div className="divider" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AirQualityTile({ air }) {
  // Rendered even while air is null so the grid doesn't reflow when it lands.
  const aqi = air && typeof air.us_aqi === "number" ? Math.round(air.us_aqi) : null;
  const band = aqiBand(aqi);
  const pm10 = air && typeof air.pm10 === "number" ? air.pm10 : null;
  const pm25 = air && typeof air.pm2_5 === "number" ? air.pm2_5 : null;
  const dust = air && typeof air.dust === "number" ? air.dust : null;

  return (
    <div className="tile">
      <div className="tile-label">Air Quality</div>
      <div className="tile-value">{aqi != null ? aqi : "—"}</div>
      <div className="tile-sub">
        {band ? band.short : "Unavailable"}
        {pm10 != null && <>
          <br />PM10 {Math.round(pm10)} · PM2.5 {pm25 != null ? Math.round(pm25) : "—"} µg/m³
        </>}
        {dust != null && dust >= DUST_VISIBLE && <>
          <br />Dust {Math.round(dust)} µg/m³
        </>}
      </div>
      {aqi != null && (
        <div className="aqi-bar-track">
          <div className="aqi-bar-dot" style={{ left: Math.min((aqi / 300) * 100, 100) + "%" }} />
        </div>
      )}
    </div>
  );
}

function DetailTiles({ current, daily, hourly, unit, air }) {
  if (!current || !daily) return null;
  const nowIdx = currentHourIndex(hourly, current.time);
  const uvNow = hourly && hourly.uv_index ? hourly.uv_index[nowIdx] : daily.uv_index_max[0];
  const visibilityKm = hourly && hourly.visibility ? (hourly.visibility[nowIdx] / 1000).toFixed(1) : null;
  const sunrise = new Date(daily.sunrise[0]);
  const sunset = new Date(daily.sunset[0]);
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  function uvLabel(v) {
    if (v <= 2) return "Low";
    if (v <= 5) return "Moderate";
    if (v <= 7) return "High";
    if (v <= 10) return "Very High";
    return "Extreme";
  }

  return (
    <div className="tiles-grid">
      <AirQualityTile air={air} />

      <div className="tile">
        <div className="tile-label">UV Index</div>
        <div className="tile-value">{Math.round(uvNow)}</div>
        <div className="tile-sub">{uvLabel(uvNow)}</div>
        <div className="uv-bar-track">
          <div className="uv-bar-dot" style={{ left: `${Math.min((uvNow / 11) * 100, 100)}%` }} />
        </div>
      </div>

      <div className="tile">
        <div className="tile-label">Sunset</div>
        <div className="tile-value" style={{ fontSize: 26 }}>{fmtTime(sunset)}</div>
        <div className="tile-sub">Sunrise: {fmtTime(sunrise)}</div>
      </div>

      <div className="tile">
        <div className="tile-label">Wind</div>
        <div className="tile-value" style={{ fontSize: 26 }}>
          {Math.round(current.wind_speed_10m)} {unit === "F" ? "mph" : "km/h"}
        </div>
        <div className="tile-sub">From {windCompassLabel(current.wind_direction_10m)}</div>
      </div>

      <div className="tile">
        <div className="tile-label">Humidity</div>
        <div className="tile-value">{Math.round(current.relative_humidity_2m)}%</div>
        <div className="tile-sub">
          Feels like {Math.round(current.apparent_temperature)}°{unit}
        </div>
      </div>

      <div className="tile">
        <div className="tile-label">Feels Like</div>
        <div className="tile-value">{Math.round(current.apparent_temperature)}°</div>
        <div className="tile-sub">
          {current.apparent_temperature < current.temperature_2m ? "Wind is making it feel cooler" : "Similar to the actual temperature"}
        </div>
      </div>

      <div className="tile">
        <div className="tile-label">Visibility</div>
        <div className="tile-value">{visibilityKm ? `${visibilityKm}` : "—"}</div>
        <div className="tile-sub">{visibilityKm ? (unit === "F" ? "mi" : "km") + " — clear view" : "Unavailable"}</div>
      </div>

      <div className="tile">
        <div className="tile-label">Pressure</div>
        <div className="tile-value" style={{ fontSize: 26 }}>{Math.round(current.surface_pressure)}</div>
        <div className="tile-sub">hPa</div>
      </div>

      <div className="tile">
        <div className="tile-label">Precipitation</div>
        <div className="tile-value" style={{ fontSize: 26 }}>{daily.precipitation_probability_max[0]}%</div>
        <div className="tile-sub">Chance today</div>
      </div>
    </div>
  );
}

/* ============================== Cities ============================== */

const DEFAULT_LOCATION = { lat: 1.3521, lon: 103.8198, name: "Singapore" };
const CITIES_KEY = "weather.cities.v1";
const UNIT_KEY = "weather.unit.v1";

// Rounded so the same place picked twice from search collapses to one entry.
function cityKey(c) {
  return c.lat.toFixed(3) + "," + c.lon.toFixed(3);
}

function loadSavedCities() {
  try {
    const arr = JSON.parse(localStorage.getItem(CITIES_KEY) || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (c) => c && typeof c.lat === "number" && typeof c.lon === "number" && c.name
    );
  } catch {
    return [];
  }
}

// The geolocated city is derived fresh each launch, so only searched cities persist.
function saveCities(list) {
  try {
    localStorage.setItem(
      CITIES_KEY,
      JSON.stringify(list.filter((c) => !c.isCurrent).map((c) => ({ name: c.name, lat: c.lat, lon: c.lon })))
    );
  } catch {
    /* private mode / storage full: the list just won't persist */
  }
}

/* ============================== City list view ============================== */

function CityCard({ city, entry, unit, onSelect, onRemove, removable }) {
  const cur = entry && entry.weather && entry.weather.current;
  const daily = entry && entry.weather && entry.weather.daily;
  const scene = cur
    ? sceneFor(
        cur.weather_code,
        getPhase(cur.time, daily && daily.sunrise[0], daily && daily.sunset[0], cur.is_day === 1),
        null,
        entry.air
      )
    : null;

  // Each card shows the city's own local time, which is what makes a list of
  // places in different zones readable at a glance.
  let localTime = null;
  if (cur && cur.time) {
    const t = cur.time.split("T")[1];
    if (t) {
      const [h, m] = t.split(":");
      const hh = parseInt(h, 10);
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = hh % 12 === 0 ? 12 : hh % 12;
      localTime = h12 + ":" + m + " " + ampm;
    }
  }

  return (
    <div
      className={"city-card" + (removable ? " city-card-removable" : "")}
      style={scene ? { background: scene.gradient } : undefined}
      onClick={() => onSelect(city)}
    >
      {scene && <div className="city-card-scene"><BackgroundScene scene={scene} /></div>}
      <div className="city-card-body">
        <div className="city-card-left">
          <div className="city-card-name">{city.name}</div>
          <div className="city-card-sub">{city.isCurrent ? "My Location" : localTime || " "}</div>
          <div className="city-card-cond">{cur ? getConditionText(cur.weather_code) : "Loading…"}</div>
        </div>
        <div className="city-card-right">
          <div className="city-card-temp">{cur ? Math.round(cur.temperature_2m) + "°" : "–"}</div>
          <div className="city-card-hilo">
            {daily ? "H:" + Math.round(daily.temperature_2m_max[0]) + "° L:" + Math.round(daily.temperature_2m_min[0]) + "°" : ""}
          </div>
        </div>
      </div>
      {removable && (
        <button
          className="city-card-remove"
          aria-label={"Remove " + city.name}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(city);
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
}

function CityListView({ cities, data, unit, onSelect, onRemove, onAdd, onUnitToggle }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  function onChange(e) {
    const v = e.target.value;
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      searchPlaces(v).then(setResults);
    }, 350);
  }

  function pick(r) {
    onAdd({ name: r.name, lat: r.latitude, lon: r.longitude });
    setQuery("");
    setResults([]);
  }

  return (
    <div className="list-view">
      <div className="list-header">
        <h1 className="list-title">Weather</h1>
        <button className="unit-toggle" onClick={onUnitToggle}>°{unit}</button>
      </div>

      <div className="city-cards">
        {cities.map((c) => (
          <CityCard
            key={cityKey(c)}
            city={c}
            entry={data[cityKey(c)]}
            unit={unit}
            onSelect={onSelect}
            onRemove={onRemove}
            removable={!c.isCurrent}
          />
        ))}
        {cities.length === 0 && (
          <div className="list-empty">Search below to add a city.</div>
        )}
      </div>

      <div className="list-search-wrap">
        {results.length > 0 && (
          <div className="list-results">
            {results.map((r) => (
              <div className="search-result-item" key={r.id} onClick={() => pick(r)}>
                <div>{r.name}</div>
                <div className="search-result-sub">
                  {[r.admin1, r.country].filter(Boolean).join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          className="list-search"
          placeholder="Search for a city"
          value={query}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

/* ============================== One city's page ============================== */

function CityPage({ city, entry, unit, scene }) {
  const weather = entry && entry.weather;
  const air = entry && entry.air;
  const current = weather && weather.current;
  const daily = weather && weather.daily;
  const hourly = weather && weather.hourly;

  return (
    <div className="city-page" style={{ background: scene.gradient }}>
      <BackgroundScene scene={scene} />
      <div className="scroll-area">
        {!weather && !(entry && entry.error) && (
          <div className="status-line">Loading weather…</div>
        )}
        {entry && entry.error && <div className="status-line">{entry.error}</div>}

        {current && daily && (
          <>
            <div className="current">
              <h1 className="current-location">{city.name}</h1>
              <p className="current-temp">{Math.round(current.temperature_2m)}°</p>
              <p className="current-condition">{getConditionText(current.weather_code)}</p>
              <p className="current-hilo">
                H:{Math.round(daily.temperature_2m_max[0])}° L:{Math.round(daily.temperature_2m_min[0])}°
              </p>
            </div>

            <HourlyPanel hourly={hourly} currentTime={current.time} unit={unit} />
            <DailyPanel daily={daily} />
            <DetailTiles current={current} daily={daily} hourly={hourly} unit={unit} air={air} />

            <div className="footer-note">
              Weather by Open-Meteo · Air quality by Open-Meteo · Location by BigDataCloud
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== App ============================== */

function sceneForEntry(entry) {
  const cur = entry && entry.weather && entry.weather.current;
  if (!cur) return sceneFor(0, "day", null, null);
  const daily = entry.weather.daily;
  const hourly = entry.weather.hourly;
  const idx = hourly ? currentHourIndex(hourly, cur.time) : 0;
  const vis =
    hourly && hourly.visibility && typeof hourly.visibility[idx] === "number"
      ? hourly.visibility[idx]
      : null;
  const phase = getPhase(cur.time, daily && daily.sunrise[0], daily && daily.sunset[0], cur.is_day === 1);
  return sceneFor(cur.weather_code, phase, vis, entry.air);
}

function App() {
  const [unit, setUnit] = useState(() => {
    try {
      return localStorage.getItem(UNIT_KEY) === "F" ? "F" : "C";
    } catch {
      return "C";
    }
  });
  const [saved, setSaved] = useState(() => loadSavedCities());
  const [currentCity, setCurrentCity] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [view, setView] = useState("detail");
  const [data, setData] = useState({});
  const pagerRef = useRef(null);
  const skipScrollSync = useRef(false);

  /*
   * With no location permission there'd be nothing to show, so the default city
   * is seeded as a normal saved entry. It has to be persisted rather than
   * synthesised on the fly: a city that only exists while the list is empty
   * vanishes the moment you add another one.
   */
  const seedDefaultIfEmpty = useCallback(() => {
    setSaved((prev) => {
      if (prev.length > 0) return prev;
      const next = [DEFAULT_LOCATION];
      saveCities(next);
      return next;
    });
  }, []);

  /* -------- locate the user once -------- */
  useEffect(() => {
    if (!navigator.geolocation) {
      seedDefaultIfEmpty();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Current Location", isCurrent: true };
        setCurrentCity(c);
        reverseGeocode(c.lat, c.lon).then((n) =>
          setCurrentCity((prev) => (prev ? { ...prev, name: n } : prev))
        );
      },
      seedDefaultIfEmpty,
      { timeout: 6000 }
    );
  }, [seedDefaultIfEmpty]);

  /*
   * The visible list. Current location leads, as it does on iOS. If geolocation
   * was denied and nothing has been saved yet, fall back to one default city so
   * the app is never empty on first run.
   */
  const cities = React.useMemo(() => {
    const list = currentCity ? [currentCity] : [];
    const seen = new Set(list.map(cityKey));
    saved.forEach((c) => {
      if (!seen.has(cityKey(c))) {
        seen.add(cityKey(c));
        list.push(c);
      }
    });
    return list;
  }, [currentCity, saved]);

  useEffect(() => {
    if (activeIdx > cities.length - 1) setActiveIdx(Math.max(0, cities.length - 1));
  }, [cities.length, activeIdx]);

  /* -------- fetch each city, and refetch all when the unit changes -------- */
  useEffect(() => {
    let cancelled = false;
    cities.forEach((c) => {
      const k = cityKey(c);
      fetchWeather(c.lat, c.lon, unit)
        .then((w) => {
          if (!cancelled) setData((d) => ({ ...d, [k]: { ...(d[k] || {}), weather: w, error: null } }));
        })
        .catch(() => {
          if (!cancelled)
            setData((d) => ({ ...d, [k]: { ...(d[k] || {}), error: "Couldn't load weather." } }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [cities.map(cityKey).join("|"), unit]);

  // Air quality doesn't depend on the unit, so it's fetched once per city.
  useEffect(() => {
    let cancelled = false;
    cities.forEach((c) => {
      const k = cityKey(c);
      if (data[k] && data[k].air !== undefined) return;
      fetchAirQuality(c.lat, c.lon).then((a) => {
        if (!cancelled) setData((d) => ({ ...d, [k]: { ...(d[k] || {}), air: a } }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cities.map(cityKey).join("|")]);

  useEffect(() => {
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch {}
  }, [unit]);

  /* -------- the active city drives the status bar and page background -------- */
  const activeCity = cities[activeIdx];
  const activeScene = sceneForEntry(activeCity ? data[cityKey(activeCity)] : null);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", activeScene.topColor);
    // The gradient (not just the top colour) so any strip of body visible above
    // or below the app matches the sky at that edge instead of showing a slab.
    document.body.style.background = activeScene.gradient;
  }, [activeScene.gradient, activeScene.topColor]);

  /*
   * Swiping is native horizontal scroll with CSS snap points rather than a JS
   * gesture handler: it gets momentum, rubber-banding and accessibility for free.
   * This just reads back which page settled under the viewport.
   */
  function onPagerScroll(e) {
    if (skipScrollSync.current) return;
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx && idx >= 0 && idx < cities.length) setActiveIdx(idx);
  }

  function goToCity(city) {
    const idx = cities.findIndex((c) => cityKey(c) === cityKey(city));
    setActiveIdx(idx === -1 ? 0 : idx);
    setView("detail");
  }

  /*
   * Line the pager up with the selected city once the detail view has actually
   * mounted. This can't be done inside goToCity: the pager doesn't exist while
   * the list is showing, so the ref is still null at that point.
   *
   * Keyed on `view` alone, deliberately -- including activeIdx would make this
   * fight the user mid-swipe.
   */
  useEffect(() => {
    if (view !== "detail") return;
    const el = pagerRef.current;
    if (!el || !el.clientWidth) return;
    skipScrollSync.current = true;
    el.scrollLeft = activeIdx * el.clientWidth;
    const t = setTimeout(() => {
      skipScrollSync.current = false;
    }, 80);
    return () => clearTimeout(t);
  }, [view]);

  function addCity(c) {
    setSaved((prev) => {
      const k = cityKey(c);
      if (prev.some((x) => cityKey(x) === k) || (currentCity && cityKey(currentCity) === k)) {
        return prev;
      }
      const next = [...prev, c];
      saveCities(next);
      return next;
    });
  }

  function removeCity(c) {
    setSaved((prev) => {
      const next = prev.filter((x) => cityKey(x) !== cityKey(c));
      saveCities(next);
      return next;
    });
    setData((d) => {
      const next = { ...d };
      delete next[cityKey(c)];
      return next;
    });
  }

  if (view === "list") {
    return (
      <div className="app" style={{ background: activeScene.gradient }}>
        <BackgroundScene scene={activeScene} />
        <CityListView
          cities={cities}
          data={data}
          unit={unit}
          onSelect={goToCity}
          onRemove={removeCity}
          onAdd={addCity}
          onUnitToggle={() => setUnit((u) => (u === "C" ? "F" : "C"))}
        />
      </div>
    );
  }

  return (
    <div className="app" style={{ background: activeScene.gradient }}>
      <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
        {cities.map((c) => {
          const entry = data[cityKey(c)];
          return (
            <div className="pager-page" key={cityKey(c)}>
              <CityPage city={c} entry={entry} unit={unit} scene={sceneForEntry(entry)} />
            </div>
          );
        })}
      </div>

      {/* Fixed chrome above the pager: unit toggle, page dots, list button. */}
      <div className="detail-topbar">
        <button className="unit-toggle" onClick={() => setUnit((u) => (u === "C" ? "F" : "C"))}>
          °{unit}
        </button>
      </div>

      <div className="detail-bottombar">
        <div className="page-dots">
          {cities.map((c, i) => (
            <span key={cityKey(c)} className={"dot" + (i === activeIdx ? " dot-on" : "")} />
          ))}
        </div>
        <button className="list-btn" aria-label="Show city list" onClick={() => setView("list")}>
          <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
            <rect x="0" y="1" width="20" height="2.4" rx="1.2" fill="currentColor" />
            <rect x="0" y="6.8" width="20" height="2.4" rx="1.2" fill="currentColor" />
            <rect x="0" y="12.6" width="20" height="2.4" rx="1.2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
