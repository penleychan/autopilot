import { z } from "zod";

export type WeatherIconName =
  | "sun"
  | "cloud-sun"
  | "cloudy"
  | "cloud-fog"
  | "cloud-drizzle"
  | "cloud-rain"
  | "cloud-rain-wind"
  | "cloud-snow"
  | "snowflake"
  | "cloud-lightning"
  | "cloud-hail"
  | "cloud";

const weatherCodeToIcon: Record<number, WeatherIconName> = {
  0: "sun", // Clear sky
  1: "cloud-sun", // Mainly clear
  2: "cloud-sun", // Partly cloudy
  3: "cloudy", // Overcast
  45: "cloud-fog", // Foggy
  48: "cloud-fog", // Depositing rime fog
  51: "cloud-drizzle", // Light drizzle
  53: "cloud-drizzle", // Moderate drizzle
  55: "cloud-drizzle", // Dense drizzle
  56: "cloud-drizzle", // Light freezing drizzle
  57: "cloud-drizzle", // Dense freezing drizzle
  61: "cloud-rain", // Slight rain
  63: "cloud-rain", // Moderate rain
  65: "cloud-rain", // Heavy rain
  66: "cloud-rain", // Light freezing rain
  67: "cloud-rain-wind", // Heavy freezing rain
  71: "cloud-snow", // Slight snow fall
  73: "cloud-snow", // Moderate snow fall
  75: "cloud-snow", // Heavy snow fall
  77: "snowflake", // Snow grains
  80: "cloud-rain", // Slight rain showers
  81: "cloud-rain", // Moderate rain showers
  82: "cloud-rain-wind", // Violent rain showers
  85: "cloud-snow", // Slight snow showers
  86: "cloud-snow", // Heavy snow showers
  95: "cloud-lightning", // Thunderstorm
  96: "cloud-hail", // Thunderstorm with slight hail
  99: "cloud-hail", // Thunderstorm with heavy hail
};

export function getWeatherIcon(code: number): WeatherIconName {
  return weatherCodeToIcon[code] || "cloud";
}

const conditions: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function getWeatherCondition(code: number): string {
  return conditions[code] || "Unknown";
}

interface GeocodingResponse {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
}
interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
  hourly: {
    precipitation_probability: number[];
    temperature_2m: number[];
  };
}

export type Forecast = z.infer<typeof forecastSchema>;

export const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  windGust: z.number(),
  conditions: z.string(),
  location: z.string(),
  icon: z.string(),
});
