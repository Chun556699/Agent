/** AgentDesk plugin: weather via Open-Meteo (free, no API key). */

async function geocode(name) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`
  );
  const data = await res.json();
  const place = data.results?.[0];
  if (!place) throw new Error(`Location '${name}' not found`);
  return { lat: place.latitude, lon: place.longitude, label: `${place.name}, ${place.country ?? ""}` };
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return res.json();
}

export default {
  id: "weather",
  name: "Weather",
  version: "1.0.0",
  tools: [
    {
      name: "weather_current",
      description: "Current weather for a place name (e.g. 'Berlin').",
      danger: "safe",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
      handler: async ({ location }) => {
        const { lat, lon, label } = await geocode(location);
        const data = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
        );
        return { location: label, current: data.current };
      },
    },
    {
      name: "weather_forecast",
      description: "Daily forecast for a place name for the next N days (max 7).",
      danger: "safe",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
          days: { type: "number", default: 3 },
        },
        required: ["location"],
      },
      handler: async ({ location, days = 3 }) => {
        const { lat, lon, label } = await geocode(location);
        const n = Math.min(Math.max(1, days), 7);
        const data = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=${n}&timezone=auto`
        );
        return { location: label, daily: data.daily };
      },
    },
  ],
};
