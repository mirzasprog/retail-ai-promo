import { supabase } from "@/integrations/supabase/client";

export interface WeatherSnapshot {
  id?: string;
  location: string;
  temperature: number;
  weather_type: string;
  recorded_at: string;
}

export interface WeatherServiceResponse {
  success: boolean;
  data?: WeatherSnapshot;
  error?: string;
}

/**
 * Dohvaća trenutno vrijeme za zadani grad
 * Koristi OpenWeatherMap API ako je konfigurisan, inače koristi fallback simulaciju
 */
export const getCurrentWeather = async (city: string): Promise<WeatherServiceResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('weather-service', {
      body: { city }
    });

    if (error) {
      console.error('Weather service error:', error);
      return {
        success: false,
        error: 'Greška pri dohvatanju podataka o vremenu'
      };
    }

    return data;
  } catch (error) {
    console.error('Error calling weather service:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nepoznata greška'
    };
  }
};

/**
 * Dohvaća najnovije podatke o vremenu za zadani grad iz baze
 */
export const getLatestWeatherSnapshot = async (location: string): Promise<WeatherSnapshot | null> => {
  try {
    const { data, error } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('location', location)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching weather snapshot:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getLatestWeatherSnapshot:', error);
    return null;
  }
};

/**
 * Dohvaća sve weather snapshot-e za zadani grad
 */
export const getWeatherHistory = async (location: string, limit: number = 10): Promise<WeatherSnapshot[]> => {
  try {
    const { data, error } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('location', location)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching weather history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getWeatherHistory:', error);
    return [];
  }
};