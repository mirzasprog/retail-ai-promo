import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, RefreshCw, Plus, Edit, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  fetched_at: string | null;
  competitor: {
    name: string;
  } | null;
}

const Competitors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [recentPrices, setRecentPrices] = useState<CompetitorPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    base_url: string;
    source_type: "api" | "csv" | "html" | "json";
    refresh_interval: number;
  }>({
    name: "",
    base_url: "",
    source_type: "html",
    refresh_interval: 3600,
  });

  const loadCompetitors = useCallback(async () => {
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
  }, [toast]);

  const loadRecentPrices = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data, error } = await supabase
        .from('competitor_prices')
        .select(`
          *,
          competitor:competitors(name)
        `)
        .order('fetched_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentPrices(data || []);
    } catch (error) {
      console.error('Error loading prices:', error);
      toast({
        title: "Greška",
        description: "Nije moguće učitati prikupljene cijene",
        variant: "destructive",
      });
    } finally {
      setRecentLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCompetitors();
    loadRecentPrices();
  }, [loadCompetitors, loadRecentPrices]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-competitors');

      if (error) {
        console.error('Error from scrape-competitors function:', error);
        throw error;
      }

      const summary = data?.summary;
      const totalPrices = summary?.totalPricesSaved ?? (
        Array.isArray(data?.results)
          ? data.results.reduce((sum: number, result: { productsFound?: number }) => sum + (result?.productsFound || 0), 0)
          : 0
      );

      toast({
        title: "Scraping je završen",
        description: `Prikupljeno je ${totalPrices} cijena.`,
      });

      await loadRecentPrices();
    } catch (error) {
      console.error('Error scraping competitors:', error);
      toast({
        title: "Greška pri scraping-u konkurenata",
        description: "Provjerite API ključ i URL-ove konkurenata.",
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

  const handleOpenDialog = (competitor?: Competitor) => {
    if (competitor) {
      setEditingCompetitor(competitor);
      setFormData({
        name: competitor.name,
        base_url: competitor.base_url,
        source_type: competitor.source_type as "api" | "csv" | "html" | "json",
        refresh_interval: competitor.refresh_interval,
      });
    } else {
      setEditingCompetitor(null);
      setFormData({
        name: "",
        base_url: "",
        source_type: "html",
        refresh_interval: 3600,
      });
    }
    setDialogOpen(true);
  };

  const handleSaveCompetitor = async () => {
    if (!formData.name.trim() || !formData.base_url.trim()) {
      toast({
        title: "Greška",
        description: "Naziv i URL su obavezni",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingCompetitor) {
        const { error } = await supabase
          .from('competitors')
          .update(formData)
          .eq('id', editingCompetitor.id);

        if (error) throw error;

        toast({
          title: "Uspješno",
          description: "Konkurent ažuriran",
        });
      } else {
        const { error } = await supabase
          .from('competitors')
          .insert([{ ...formData, is_active: true }]);

        if (error) throw error;

        toast({
          title: "Uspješno",
          description: "Konkurent dodan",
        });
      }

      setDialogOpen(false);
      await loadCompetitors();
    } catch (error) {
      console.error('Error saving competitor:', error);
      toast({
        title: "Greška",
        description: error instanceof Error ? error.message : "Nije moguće sačuvati konkurenta",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCompetitor = async (competitorId: string) => {
    if (!confirm("Da li ste sigurni da želite obrisati ovog konkurenta?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('competitors')
        .delete()
        .eq('id', competitorId);

      if (error) throw error;

      toast({
        title: "Uspješno",
        description: "Konkurent obrisan",
      });

      await loadCompetitors();
    } catch (error) {
      console.error('Error deleting competitor:', error);
      toast({
        title: "Greška",
        description: "Nije moguće obrisati konkurenta",
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
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj Konkurenta
        </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCompetitor ? "Uredi Konkurenta" : "Dodaj Konkurenta"}
            </DialogTitle>
            <DialogDescription>
              Unesite detalje o konkurentu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Naziv</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="npr. Bingo"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="base_url">Base URL</Label>
              <Input
                id="base_url"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="https://www.example.com/akcije"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="source_type">Tip Izvora</Label>
              <Select
                value={formData.source_type}
                onValueChange={(value: "api" | "csv" | "html" | "json") => setFormData({ ...formData, source_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="refresh_interval">Interval Osvježavanja (sekundi)</Label>
              <Input
                id="refresh_interval"
                type="number"
                value={formData.refresh_interval}
                onChange={(e) => setFormData({ ...formData, refresh_interval: parseInt(e.target.value) })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Otkaži
              </Button>
              <Button onClick={handleSaveCompetitor}>
                Spremi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCompetitorStatus(competitor.id, competitor.is_active)}
                        >
                          {competitor.is_active ? "Deaktiviraj" : "Aktiviraj"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(competitor)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCompetitor(competitor.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
            Posljednjih 20 cijena prikupljenih sa konkurentskih stranica
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          ) : recentPrices.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nema prikupljenih cijena</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Konkurent</TableHead>
                  <TableHead>Naziv artikla</TableHead>
                  <TableHead>Akcijska cijena</TableHead>
                  <TableHead>Redovna cijena</TableHead>
                  <TableHead>Datum prikupljanja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPrices.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell className="font-medium">
                      {price.competitor?.name || 'N/A'}
                    </TableCell>
                    <TableCell>{price.product_name}</TableCell>
                    <TableCell>
                      {price.promo_price ? `${price.promo_price.toFixed(2)} KM` : '-'}
                    </TableCell>
                    <TableCell>
                      {price.regular_price ? `${price.regular_price.toFixed(2)} KM` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {price.fetched_at ? new Date(price.fetched_at).toLocaleString('bs-BA') : '-'}
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