import { useState } from 'react';
import { getCurrentWeather, getLatestWeatherSnapshot, WeatherSnapshot } from '@/services/weatherService';
import { toast } from 'sonner';

export const useWeather = () => {
  const [loading, setLoading] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherSnapshot | null>(null);

  const fetchWeather = async (city: string) => {
    setLoading(true);
    try {
      const response = await getCurrentWeather(city);
      
      if (response.success && response.data) {
        setWeatherData(response.data);
        toast.success('Podaci o vremenu su ažurirani');
        return response.data;
      } else {
        toast.error(response.error || 'Greška pri dohvatanju vremena');
        return null;
      }
    } catch (error) {
      console.error('Error fetching weather:', error);
      toast.error('Greška pri dohvatanju vremena');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getLatestWeather = async (city: string) => {
    setLoading(true);
    try {
      const data = await getLatestWeatherSnapshot(city);
      if (data) {
        setWeatherData(data);
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error getting latest weather:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    weatherData,
    fetchWeather,
    getLatestWeather
  };
};