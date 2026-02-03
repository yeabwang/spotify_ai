import { UserContext } from './ai/openai';
import { getWeatherForCurrentLocation, WeatherData } from './weather/weatherService';

export const getTimeOfDay = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

export const getDayOfWeek = (): string => {
  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${dayNames[day]} (${isWeekend ? 'weekend' : 'weekday'})`;
};

export const getSeason = (): string => {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
};

export const buildUserContext = async (
  recentlyPlayed?: string[],
  topArtists?: string[],
  topGenres?: string[]
): Promise<UserContext> => {
  let weather: WeatherData | null = null;
  
  try {
    weather = await getWeatherForCurrentLocation();
  } catch (error) {
    console.warn('Could not get weather data');
  }

  return {
    timeOfDay: getTimeOfDay(),
    dayOfWeek: getDayOfWeek(),
    weather: weather ? {
      condition: weather.condition,
      temperature: weather.temperature,
      description: weather.description,
    } : undefined,
    recentlyPlayed,
    topArtists,
    topGenres,
  };
};
