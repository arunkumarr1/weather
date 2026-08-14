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

function backgroundFor(iconType) {
  const gradients = {
    "clear-day": "linear-gradient(180deg, #3a9be0 0%, #6cc0f0 55%, #a9dcf5 100%)",
    "clear-night": "linear-gradient(180deg, #0b1330 0%, #131c47 55%, #1d2a5e 100%)",
    "partly-day": "linear-gradient(180deg, #5a93c4 0%, #82aecb 55%, #b6cdd8 100%)",
    "partly-night": "linear-gradient(180deg, #171f3d 0%, #232c50 55%, #2c3560 100%)",
    cloudy: "linear-gradient(180deg, #5b6472 0%, #7c8794 55%, #9aa3ac 100%)",
    fog: "linear-gradient(180deg, #7c8792 0%, #9aa3ab 55%, #b7bec4 100%)",
    drizzle: "linear-gradient(180deg, #4c5b68 0%, #64757f 55%, #85929a 100%)",
    rain: "linear-gradient(180deg, #3b4a58 0%, #4f5f6c 55%, #6c7a86 100%)",
    snow: "linear-gradient(180deg, #6b7787 0%, #8d97a3 55%, #c3cad2 100%)",
    thunder: "linear-gradient(180deg, #232a33 0%, #333d47 55%, #4a5560 100%)",
  };
  return gradients[iconType] || gradients.cloudy;
}

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

function BackgroundScene({ iconType }) {
  const showStars = iconType === "clear-night" || iconType === "partly-night";
  const showSun = iconType === "clear-day";
  const showRain = iconType === "rain" || iconType === "drizzle" || iconType === "thunder";
  const showSnow = iconType === "snow";

  const drops = useRef(
    [...Array(24)].map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 0.6 + Math.random() * 0.5,
    }))
  ).current;
  const flakes = useRef(
    [...Array(18)].map(() => ({
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 4 + Math.random() * 3,
    }))
  ).current;

  return (
    <div className="bg-layer">
      {showStars && <div className="stars" />}
      {showSun && <div className="sun-glow" />}
      {showRain && (
        <div className="rain-layer">
          {drops.map((d, i) => (
            <div
              key={i}
              className="drop"
              style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s` }}
            />
          ))}
        </div>
      )}
      {showSnow && (
        <div className="snow-layer">
          {flakes.map((f, i) => (
            <div
              key={i}
              className="flake"
              style={{ left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s` }}
            />
          ))}
        </div>
      )}
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

function DetailTiles({ current, daily, hourly, unit }) {
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
  const iconType = current ? getIconType(current.weather_code, current.is_day === 1) : "clear-day";
  const bg = backgroundFor(iconType);
  const conditionText = current ? getConditionText(current.weather_code) : "";
  const daily = weather && weather.daily;
  const hourly = weather && weather.hourly;

  return (
    <div className="app" style={{ background: bg }}>
      <BackgroundScene iconType={iconType} />
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
            <DetailTiles current={current} daily={daily} hourly={hourly} unit={unit} />

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
