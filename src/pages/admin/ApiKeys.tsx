import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ApiKeys = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState({
    openai: false,
    weather: false,
  });
  const [keys, setKeys] = useState({
    openai_api_key: "",
    weather_api_key: "",
  });

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_api_keys')
        .select('key_name, key_value');

      if (error) throw error;

      const keysMap: any = {};
      data?.forEach(item => {
        keysMap[item.key_name] = item.key_value;
      });

      setKeys({
        openai_api_key: keysMap.openai_api_key || "",
        weather_api_key: keysMap.weather_api_key || "",
      });
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        title: "Greška",
        description: "Nije moguće učitati API ključeve",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update or insert each key
      for (const [keyName, keyValue] of Object.entries(keys)) {
        if (keyValue.trim()) {
          const { error } = await supabase
            .from('system_api_keys')
            .upsert({
              key_name: keyName,
              key_value: keyValue,
              updated_by: user?.id,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'key_name'
            });

          if (error) throw error;
        }
      }

      toast({
        title: "Uspješno",
        description: "API ključevi su uspješno sačuvani.",
      });
    } catch (error) {
      console.error('Error saving API keys:', error);
      toast({
        title: "Greška",
        description: "Nije moguće sačuvati API ključeve",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + "•".repeat(key.length - 8) + key.substring(key.length - 4);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Nazad
        </Button>
        <div className="flex-1">
          <h1 className="text-4xl font-bold">API Ključevi</h1>
          <p className="text-muted-foreground">OpenAI i Weather API konfiguracija</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Spremanje..." : "Spremi"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Konfiguracija</CardTitle>
          <CardDescription>
            Postavite API ključeve za eksterne servise
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="openai_key">OpenAI API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="openai_key"
                    type={showKeys.openai ? "text" : "password"}
                    value={showKeys.openai ? keys.openai_api_key : maskKey(keys.openai_api_key)}
                    onChange={(e) => setKeys({ ...keys, openai_api_key: e.target.value })}
                    placeholder="sk-..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKeys({ ...showKeys, openai: !showKeys.openai })}
                  >
                    {showKeys.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="weather_key">Weather API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="weather_key"
                    type={showKeys.weather ? "text" : "password"}
                    value={showKeys.weather ? keys.weather_api_key : maskKey(keys.weather_api_key)}
                    onChange={(e) => setKeys({ ...keys, weather_api_key: e.target.value })}
                    placeholder="Enter weather API key"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKeys({ ...showKeys, weather: !showKeys.weather })}
                  >
                    {showKeys.weather ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeys;
