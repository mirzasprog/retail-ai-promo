import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const ApiKeys = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Nazad
        </Button>
        <div>
          <h1 className="text-4xl font-bold">API Ključevi</h1>
          <p className="text-muted-foreground">OpenAI i Weather API konfiguracija</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Konfiguracija</CardTitle>
          <CardDescription>
            Postavite API ključeve za eksterne servise
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Funkcionalnost za upravljanje API ključevima će uskoro biti dostupna
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeys;
