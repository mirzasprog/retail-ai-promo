import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Competitor {
  id: string;
  name: string;
  base_url: string;
  source_type: string;
  is_active: boolean;
  refresh_interval: number;
  created_at: string;
}

interface CompetitorPrice {
  id: string;
  product_name: string;
  regular_price: number | null;
  promo_price: number | null;
  competitor_id: string;
  fetched_at: string;
}

const Competitors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [recentPrices, setRecentPrices] = useState<CompetitorPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    loadCompetitors();
    loadRecentPrices();
  }, []);

  const loadCompetitors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('competitors')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompetitors(data || []);
    } catch (error) {
      console.error('Error loading competitors:', error);
      toast({
        title: "Greška",
        description: "Nije moguće učitati konkurente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRecentPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('competitor_prices')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentPrices(data || []);
    } catch (error) {
      console.error('Error loading prices:', error);
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-competitors');

      if (error) throw error;

      toast({
        title: "Scraping završen",
        description: `Prikupljeno ${data?.results?.length || 0} rezultata`,
      });

      // Reload recent prices
      await loadRecentPrices();
    } catch (error) {
      console.error('Error scraping competitors:', error);
      toast({
        title: "Greška",
        description: "Scraping nije uspio",
        variant: "destructive",
      });
    } finally {
      setScraping(false);
    }
  };

  const toggleCompetitorStatus = async (competitorId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('competitors')
        .update({ is_active: !currentStatus })
        .eq('id', competitorId);

      if (error) throw error;

      toast({
        title: "Uspješno",
        description: "Status konkurenta ažuriran",
      });

      await loadCompetitors();
    } catch (error) {
      console.error('Error updating competitor:', error);
      toast({
        title: "Greška",
        description: "Nije moguće ažurirati status",
        variant: "destructive",
      });
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
          <h1 className="text-4xl font-bold">Konkurenti</h1>
          <p className="text-muted-foreground">Upravljanje izvorima podataka konkurenata</p>
        </div>
        <Button onClick={handleScrape} disabled={scraping}>
          {scraping ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Scraping...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Pokreni Scraping
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktivni Konkurenti</CardTitle>
          <CardDescription>
            Lista konkurenata za prikupljanje podataka o cijenama
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          ) : competitors.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nema dodanih konkurenata</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naziv</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Tip Izvora</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => (
                  <TableRow key={competitor.id}>
                    <TableCell className="font-medium">{competitor.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {competitor.base_url}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{competitor.source_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={competitor.is_active ? "default" : "secondary"}>
                        {competitor.is_active ? "Aktivan" : "Neaktivan"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCompetitorStatus(competitor.id, competitor.is_active)}
                      >
                        {competitor.is_active ? "Deaktiviraj" : "Aktiviraj"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nedavno Prikupljene Cijene</CardTitle>
          <CardDescription>
            Posljednjih 10 cijena prikupljenih sa konkurentskih stranica
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentPrices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nema prikupljenih cijena</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proizvod</TableHead>
                  <TableHead>Akcijska Cijena</TableHead>
                  <TableHead>Redovna Cijena</TableHead>
                  <TableHead>Datum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPrices.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell className="font-medium">{price.product_name}</TableCell>
                    <TableCell>
                      {price.promo_price ? `${price.promo_price} KM` : '-'}
                    </TableCell>
                    <TableCell>
                      {price.regular_price ? `${price.regular_price} KM` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(price.fetched_at).toLocaleString('bs-BA')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Competitors;
