export interface WeatherData {
  condition: string;
  temperature: number;
  description: string;
  humidity: number;
  icon: string;
}

export const fetchWeather = async (lat: number, lon: number): Promise<WeatherData | null> => {
  const apiKey = process.env.REACT_APP_OPENWEATHER_API_KEY;
  
  if (!apiKey) {
    console.warn('OpenWeather API key not configured');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
    );
    
    if (!response.ok) {
      throw new Error('Weather API request failed');
    }
    
    const data = await response.json();
    
    return {
      condition: data.weather[0]?.main || 'Unknown',
      temperature: Math.round(data.main.temp),
      description: data.weather[0]?.description || '',
      humidity: data.main.humidity,
      icon: data.weather[0]?.icon || '01d',
    };
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return null;
  }
};

export const getCurrentLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000, // 5 minutes
    });
  });
};

export const getWeatherForCurrentLocation = async (): Promise<WeatherData | null> => {
  try {
    const position = await getCurrentLocation();
    return fetchWeather(position.coords.latitude, position.coords.longitude);
  } catch (error) {
    console.error('Failed to get location:', error);
    return null;
  }
};
