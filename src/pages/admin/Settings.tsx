import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    default_city: "",
    default_country: "BiH",
    competitor_refresh_interval_minutes: "60",
    weather_refresh_interval_minutes: "30",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value');

      if (error) throw error;

      const settingsMap: any = {};
      data?.forEach(item => {
        settingsMap[item.setting_key] = item.setting_value;
      });

      setSettings({
        default_city: settingsMap.default_city || "",
        default_country: settingsMap.default_country || "BiH",
        competitor_refresh_interval_minutes: settingsMap.competitor_refresh_interval_minutes || "60",
        weather_refresh_interval_minutes: settingsMap.weather_refresh_interval_minutes || "30",
      });
    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Greška",
        description: "Nije moguće učitati podešavanja",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings.default_city.trim()) {
      toast({
        title: "Greška",
        description: "Obavezno unesite default grad",
        variant: "destructive",
      });
      return;
    }

    if (parseInt(settings.competitor_refresh_interval_minutes) < 5) {
      toast({
        title: "Greška",
        description: "Interval osvježavanja konkurenata mora biti najmanje 5 minuta",
        variant: "destructive",
      });
      return;
    }

    if (parseInt(settings.weather_refresh_interval_minutes) < 5) {
      toast({
        title: "Greška",
        description: "Interval osvježavanja vremena mora biti najmanje 5 minuta",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update or insert each setting
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from('system_settings')
          .upsert({
            setting_key: key,
            setting_value: value,
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'setting_key'
          });

        if (error) throw error;
      }

      toast({
        title: "Uspješno",
        description: "Podešavanja su sačuvana",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Greška",
        description: "Nije moguće sačuvati podešavanja",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Nazad
        </Button>
        <div className="flex-1">
          <h1 className="text-4xl font-bold">Sistem Podešavanja</h1>
          <p className="text-muted-foreground">Default grad, intervali osvježavanja</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Spremanje..." : "Spremi"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opća Podešavanja</CardTitle>
          <CardDescription>
            Globalna sistemska podešavanja
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="default_city">Default Grad</Label>
                <Input
                  id="default_city"
                  value={settings.default_city}
                  onChange={(e) => setSettings({ ...settings, default_city: e.target.value })}
                  placeholder="npr. Sarajevo"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="default_country">Default Država</Label>
                <Input
                  id="default_country"
                  value={settings.default_country}
                  onChange={(e) => setSettings({ ...settings, default_country: e.target.value })}
                  placeholder="npr. BiH"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="competitor_refresh">Interval Osvježavanja Konkurenata (minuta)</Label>
                <Input
                  id="competitor_refresh"
                  type="number"
                  min="5"
                  value={settings.competitor_refresh_interval_minutes}
                  onChange={(e) => setSettings({ ...settings, competitor_refresh_interval_minutes: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weather_refresh">Interval Osvježavanja Vremena (minuta)</Label>
                <Input
                  id="weather_refresh"
                  type="number"
                  min="5"
                  value={settings.weather_refresh_interval_minutes}
                  onChange={(e) => setSettings({ ...settings, weather_refresh_interval_minutes: e.target.value })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
