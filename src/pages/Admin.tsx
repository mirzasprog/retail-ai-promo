import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Database, Users, Key, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

const Admin = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Admin Panel</h1>
        <p className="text-muted-foreground">Konfigurisanje sistema i upravljanje podešavanjima</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>API Ključevi</CardTitle>
            </div>
            <CardDescription>OpenAI i Weather API konfiguracija</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Podesi API Ključeve
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>Konkurenti</CardTitle>
            </div>
            <CardDescription>Upravljanje izvorima podataka konkurenata</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Upravljaj Konkurentima
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Korisnici i Role</CardTitle>
            </div>
            <CardDescription>Upravljanje pristupom i dozvolama</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Upravljaj Korisnicima
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>Praznici</CardTitle>
            </div>
            <CardDescription>Definisanje godišnjih praznika</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Uredi Praznike
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle>Sistem Podešavanja</CardTitle>
            </div>
            <CardDescription>Default grad, intervali osvježavanja</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Opća Podešavanja
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;
