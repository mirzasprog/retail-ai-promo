import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, ShoppingCart, AlertCircle, CheckCircle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalProducts: 0,
    evaluationsToday: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    
    const [campaignsRes, productsRes] = await Promise.all([
      supabase.from("campaigns").select("*", { count: "exact" }),
      supabase.from("products").select("*", { count: "exact" }),
    ]);

    const activeCampaigns = await supabase
      .from("campaigns")
      .select("*", { count: "exact" })
      .eq("status", "active");

    setStats({
      totalCampaigns: campaignsRes.count || 0,
      activeCampaigns: activeCampaigns.count || 0,
      totalProducts: productsRes.count || 0,
      evaluationsToday: 0,
    });
    
    setLoading(false);
  };

  const StatCard = ({ title, value, icon: Icon, description, trend }: any) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <Badge variant="secondary" className="mt-2">
            <TrendingUp className="h-3 w-3 mr-1" />
            {trend}
          </Badge>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Pregled sistema za planiranje akcija</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Pregled sistema za planiranje akcija i kataloga</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Ukupno Kampanja"
          value={stats.totalCampaigns}
          icon={Calendar}
          description="Sve kreirane kampanje"
        />
        <StatCard
          title="Aktivne Kampanje"
          value={stats.activeCampaigns}
          icon={CheckCircle}
          description="Trenutno aktivne"
          trend="+2 ove sedmice"
        />
        <StatCard
          title="Ukupno Proizvoda"
          value={stats.totalProducts}
          icon={ShoppingCart}
          description="U bazi podataka"
        />
        <StatCard
          title="LLM Evaluacije"
          value={stats.evaluationsToday}
          icon={TrendingUp}
          description="Danas"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Brzi Pristup</CardTitle>
            <CardDescription>Najkorištenije funkcije</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/campaigns" className="block p-4 rounded-lg border hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Nova Kampanja</p>
                  <p className="text-sm text-muted-foreground">Kreiraj novu promocijsku kampanju</p>
                </div>
              </div>
            </Link>
            <Link to="/admin" className="block p-4 rounded-lg border hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Dodaj Proizvod</p>
                  <p className="text-sm text-muted-foreground">Unesi novi artikal u bazu</p>
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Obavještenja</CardTitle>
            <CardDescription>Važne poruke i upozorenja</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium text-sm">Sistem je spreman</p>
                <p className="text-xs text-muted-foreground">
                  Počnite sa kreiranjem kampanja i dodavanjem proizvoda
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
