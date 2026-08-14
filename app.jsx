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

function WeatherIcon({ type, size = 44 }) {
  const s = size;
  switch (type) {
    case "clear-day":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="24" fill="#FFD23F" />
          {[...Array(8)].map((_, i) => {
            const a = (i * Math.PI) / 4;
            const x1 = 50 + Math.cos(a) * 34, y1 = 50 + Math.sin(a) * 34;
            const x2 = 50 + Math.cos(a) * 44, y2 = 50 + Math.sin(a) * 44;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFD23F" strokeWidth="5" strokeLinecap="round" />;
          })}
        </svg>
      );
    case "clear-night":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <path d="M62 20a32 32 0 1 0 18 58 26 26 0 0 1-18-58z" fill="#DCE3F0" />
          <circle cx="78" cy="30" r="2.5" fill="#fff" />
          <circle cx="85" cy="42" r="1.5" fill="#fff" />
        </svg>
      );
    case "partly-day":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <circle cx="38" cy="38" r="18" fill="#FFD23F" />
          <ellipse cx="58" cy="62" rx="30" ry="20" fill="#F2F5F8" />
          <ellipse cx="38" cy="58" rx="20" ry="14" fill="#fff" opacity="0.9" />
        </svg>
      );
    case "partly-night":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <path d="M46 22a22 22 0 1 0 12 40 18 18 0 0 1-12-40z" fill="#DCE3F0" />
          <ellipse cx="58" cy="66" rx="30" ry="18" fill="#AEB9C9" />
        </svg>
      );
    case "cloudy":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <ellipse cx="50" cy="60" rx="34" ry="22" fill="#E7EAED" />
          <ellipse cx="32" cy="52" rx="18" ry="14" fill="#fff" />
        </svg>
      );
    case "fog":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <ellipse cx="50" cy="42" rx="28" ry="16" fill="#EEF1F3" opacity="0.9" />
          {[36, 50, 64, 78].map((y, i) => (
            <rect key={i} x="15" y={y} width="70" height="5" rx="2.5" fill="#EEF1F3" opacity={0.9 - i * 0.15} />
          ))}
        </svg>
      );
    case "drizzle":
    case "rain":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <ellipse cx="50" cy="42" rx="30" ry="18" fill="#DDE3E8" />
          {[34, 50, 66].map((x, i) => (
            <line key={i} x1={x} y1="66" x2={x - 6} y2="86" stroke="#6FB3E8" strokeWidth="4" strokeLinecap="round" />
          ))}
        </svg>
      );
    case "snow":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <ellipse cx="50" cy="42" rx="30" ry="18" fill="#E7EAED" />
          {[34, 50, 66].map((x, i) => (
            <circle key={i} cx={x} cy="80" r="3.2" fill="#fff" />
          ))}
        </svg>
      );
    case "thunder":
      return (
        <svg width={s} height={s} viewBox="0 0 100 100">
          <ellipse cx="50" cy="40" rx="30" ry="18" fill="#7C8794" />
          <polygon points="55,58 40,80 52,80 45,96 68,68 55,68" fill="#FFD23F" />
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

/* ============================== App ============================== */

const DEFAULT_LOCATION = { lat: 1.3521, lon: 103.8198, name: "Singapore" };

function App() {
  const [coords, setCoords] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [unit, setUnit] = useState("C");
  const [weather, setWeather] = useState(null);
  const [air, setAir] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef(null);

  // Initial location: try geolocation, fall back to default.
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          setCoords({ lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon });
          setLocationName(DEFAULT_LOCATION.name);
        },
        { timeout: 6000 }
      );
    } else {
      setCoords({ lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon });
      setLocationName(DEFAULT_LOCATION.name);
    }
  }, []);

  // Resolve a human-readable name whenever coords change without one already set.
  useEffect(() => {
    if (!coords) return;
    if (!locationName) {
      reverseGeocode(coords.lat, coords.lon).then(setLocationName);
    }
  }, [coords]);

  const loadWeather = useCallback(
    (lat, lon, u) => {
      setLoading(true);
      setError(null);
      fetchWeather(lat, lon, u)
        .then(setWeather)
        .catch(() => setError("Couldn't load weather. Check your connection and try again."))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (coords) loadWeather(coords.lat, coords.lon, unit);
  }, [coords, unit, loadWeather]);

  /*
   * Air quality is fetched separately and not tied to `unit`, since changing
   * C/F has no bearing on it. Cleared first so a stale reading from the previous
   * city can't colour the sky for the new one.
   */
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setAir(null);
    fetchAirQuality(coords.lat, coords.lon).then((a) => {
      if (!cancelled) setAir(a);
    });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  function handleSearchChange(e) {
    const val = e.target.value;
    setQuery(val);
    setShowResults(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchPlaces(val).then(setResults);
    }, 350);
  }

  function pickResult(r) {
    setCoords({ lat: r.latitude, lon: r.longitude });
    setLocationName(r.admin1 && r.admin1 !== r.name ? `${r.name}` : r.name);
    setQuery("");
    setResults([]);
    setShowResults(false);
  }

  const current = weather && weather.current;
  const conditionText = current ? getConditionText(current.weather_code) : "";
  const daily = weather && weather.daily;
  const hourly = weather && weather.hourly;

  const nowIdx = hourly && current ? currentHourIndex(hourly, current.time) : 0;
  const visibilityM =
    hourly && hourly.visibility && typeof hourly.visibility[nowIdx] === "number"
      ? hourly.visibility[nowIdx]
      : null;
  const phase =
    current && daily
      ? getPhase(current.time, daily.sunrise[0], daily.sunset[0], current.is_day === 1)
      : "day";
  const scene = current
    ? sceneFor(current.weather_code, phase, visibilityM, air)
    : sceneFor(0, "day", null, null);

  /*
   * In standalone mode Android paints the status bar with theme-color, so a fixed
   * value leaves a mismatched strip above the page whenever the sky is anything
   * other than that one colour. Track the scene's zenith colour instead. body
   * gets it too, so overscroll past the top doesn't flash a different shade.
   */
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", scene.topColor);
    document.body.style.background = scene.topColor;
  }, [scene.topColor]);

  return (
    <div className="app" style={{ background: scene.gradient }}>
      <BackgroundScene scene={scene} />
      <div className="scroll-area">
        <div className="topbar">
          <input
            className="search-input"
            placeholder="Search for a city"
            value={query}
            onChange={handleSearchChange}
            onFocus={() => setShowResults(true)}
          />
          <button className="unit-toggle" onClick={() => setUnit((u) => (u === "C" ? "F" : "C"))}>
            °{unit}
          </button>
          {showResults && results.length > 0 && (
            <div className="search-results">
              {results.map((r) => (
                <div className="search-result-item" key={r.id} onClick={() => pickResult(r)}>
                  <div>{r.name}</div>
                  <div className="search-result-sub">
                    {[r.admin1, r.country].filter(Boolean).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && !weather && <div className="status-line">Loading weather…</div>}
        {error && <div className="status-line">{error}</div>}

        {current && daily && (
          <>
            <div className="current">
              <h1 className="current-location">{locationName || "—"}</h1>
              <p className="current-temp">{Math.round(current.temperature_2m)}°</p>
              <p className="current-condition">{conditionText}</p>
              <p className="current-hilo">
                H:{Math.round(daily.temperature_2m_max[0])}° L:{Math.round(daily.temperature_2m_min[0])}°
              </p>
            </div>

            <HourlyPanel hourly={hourly} currentTime={weather.current.time} unit={unit} />
            <DailyPanel daily={daily} />
            <DetailTiles current={current} daily={daily} hourly={hourly} unit={unit} air={air} />

            <div className="footer-note">
              Weather data by Open-Meteo · Location by BigDataCloud
            </div>
          </>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
