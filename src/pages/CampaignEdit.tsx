import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Sparkles, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CampaignItem {
  productId: string;
  productName: string;
  productSku: string;
  proposedPrice: number;
  regularPrice: number;
  analyzing?: boolean;
  analysis?: {
    is_item_good: boolean;
    item_score: number;
    is_price_good: boolean;
    recommended_price: number | null;
    reasoning_bs: string;
  };
}

const CampaignEdit = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [campaignItems, setCampaignItems] = useState<CampaignItem[]>([]);
  const [campaignData, setCampaignData] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      try {
        const [{ data: campaign, error: campaignError }, { data: productsData, error: productsError }, { data: itemsData, error: itemsError }] =
          await Promise.all([
            supabase.from("campaigns").select("*").eq("id", id).single(),
            supabase.from("products").select("*").order("name"),
            supabase.from("campaign_items").select("*").eq("campaign_id", id),
          ]);

        if (campaignError) throw campaignError;
        if (productsError) throw productsError;
        if (itemsError) throw itemsError;

        setProducts(productsData || []);

        if (campaign) {
          setCampaignData({
            name: campaign.name,
            description: campaign.description || "",
            startDate: campaign.start_date,
            endDate: campaign.end_date,
          });
        }

        const items: CampaignItem[] = (itemsData || []).map((item: any) => {
          const product = (productsData || []).find((p: any) => p.id === item.product_id);
          return {
            productId: item.product_id,
            productName: product?.name || "",
            productSku: product?.sku || "",
            proposedPrice: Number(item.proposed_price) || Number(product?.regular_price) || 0,
            regularPrice: Number(product?.regular_price) || 0,
          };
        });

        setCampaignItems(items);
      } catch (error: any) {
        console.error("Greška pri učitavanju kampanje:", error);
        toast.error("Greška pri učitavanju kampanje");
      } finally {
        setInitialLoading(false);
      }
    };

    loadData();
  }, [id]);

  const addProduct = () => {
    if (products.length === 0) {
      toast.error("Prvo učitajte proizvode");
      return;
    }

    const product = products[0];
    setCampaignItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        proposedPrice: product.regular_price || 0,
        regularPrice: product.regular_price || 0,
      },
    ]);
  };

  const removeProduct = (index: number) => {
    setCampaignItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    setCampaignItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === "productId") {
        const product = products.find((p) => p.id === value);
        if (product) {
          updated[index].productName = product.name;
          updated[index].productSku = product.sku;
          updated[index].regularPrice = product.regular_price || 0;
          updated[index].proposedPrice = product.regular_price || 0;
        }
      }

      return updated;
    });
  };

  const analyzeProduct = async (index: number) => {
    const item = campaignItems[index];

    if (!item.productId || !item.proposedPrice) {
      toast.error("Molim vas popunite sve podatke");
      return;
    }

    const updated = [...campaignItems];
    updated[index].analyzing = true;
    setCampaignItems(updated);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-product", {
        body: {
          productId: item.productId,
          proposedPrice: item.proposedPrice,
        },
      });

      if (error) throw error;

      updated[index].analyzing = false;
      updated[index].analysis = data.evaluation;
      setCampaignItems(updated);

      toast.success("Analiza završena!");
    } catch (error: any) {
      console.error("Greška pri analizi:", error);
      updated[index].analyzing = false;
      setCampaignItems(updated);
      toast.error("Greška pri analizi: " + (error.message || "Nepoznata greška"));
    }
  };

  const saveCampaign = async () => {
    if (!id) return;

    if (!campaignData.name || !campaignData.startDate || !campaignData.endDate) {
      toast.error("Molim vas popunite osnovne podatke kampanje");
      return;
    }

    if (campaignItems.length === 0) {
      toast.error("Molim vas dodajte barem jedan proizvod");
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Niste prijavljeni");
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from("campaigns")
        .update({
          name: campaignData.name,
          description: campaignData.description,
          start_date: campaignData.startDate,
          end_date: campaignData.endDate,
        })
        .eq("id", id);

      if (updateError) throw updateError;

      const { error: deleteError } = await supabase
        .from("campaign_items")
        .delete()
        .eq("campaign_id", id);

      if (deleteError) throw deleteError;

      const itemsToInsert = campaignItems.map((item) => ({
        campaign_id: id,
        product_id: item.productId,
        proposed_price: item.proposedPrice,
        final_price: item.analysis?.recommended_price || item.proposedPrice,
      }));

      const { error: itemsError } = await supabase
        .from("campaign_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      toast.success("Kampanja uspješno ažurirana!");
      navigate("/campaigns");
    } catch (error: any) {
      console.error("Greška pri ažuriranju kampanje:", error);
      toast.error("Greška pri ažuriranju kampanje: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Učitavanje kampanje...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Nazad
        </Button>
        <div>
          <h1 className="text-4xl font-bold">Uredi Kampanju</h1>
          <p className="text-muted-foreground">Izmijenite postojeću promocijsku kampanju</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Osnovni Podaci</CardTitle>
            <CardDescription>Unesite osnovne informacije o kampanji</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Naziv Kampanje *</Label>
              <Input
                id="name"
                placeholder="npr. Ljetnja Akcija 2024"
                value={campaignData.name}
                onChange={(e) => setCampaignData({ ...campaignData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                placeholder="Kratki opis kampanje..."
                value={campaignData.description}
                onChange={(e) => setCampaignData({ ...campaignData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Datum Početka *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={campaignData.startDate}
                  onChange={(e) => setCampaignData({ ...campaignData, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">Datum Kraja *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={campaignData.endDate}
                  onChange={(e) => setCampaignData({ ...campaignData, endDate: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brza Radnja</CardTitle>
            <CardDescription>Spremite kampanju ili dodajte proizvode</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={addProduct} variant="outline" className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Dodaj Proizvod
            </Button>
            <Button
              onClick={saveCampaign}
              disabled={loading}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Spremanje...
                </>
              ) : (
                "Spremi Promjene"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proizvodi u Kampanji</CardTitle>
          <CardDescription>
            Dodajte proizvode i pokrenite AI analizu za preporuke cijena
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaignItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                Još nema proizvoda u kampanji
              </p>
              <Button onClick={addProduct} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Dodaj Prvi Proizvod
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {campaignItems.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="grid gap-4 md:grid-cols-12">
                    <div className="md:col-span-4">
                      <Label>Proizvod</Label>
                      <Select
                        value={item.productId}
                        onValueChange={(value) => updateItem(index, "productId", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <Label>Redovna Cijena</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.regularPrice}
                        disabled
                        className="bg-muted"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Predložena Cijena</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.proposedPrice}
                        onChange={(e) =>
                          updateItem(index, "proposedPrice", parseFloat(e.target.value))
                        }
                      />
                    </div>

                    <div className="md:col-span-4 flex items-end gap-2">
                      <Button
                        variant="secondary"
                        className="gap-2 flex-1"
                        onClick={() => analyzeProduct(index)}
                        disabled={item.analyzing}
                      >
                        {item.analyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analiziram...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            AI Analiza
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {item.analysis && (
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={item.analysis.is_item_good ? "default" : "destructive"}>
                          {item.analysis.is_item_good ? "Dobar kandidat" : "Loš kandidat"}
                        </Badge>
                        <Badge variant="outline">
                          Ocjena: {item.analysis.item_score}/100
                        </Badge>
                        <Badge variant={item.analysis.is_price_good ? "default" : "secondary"}>
                          Cijena: {item.analysis.is_price_good ? "Dobra" : "Preporučena promjena"}
                        </Badge>
                        {item.analysis.recommended_price && (
                          <Badge variant="secondary">
                            Preporučena: {item.analysis.recommended_price} KM
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.analysis.reasoning_bs}
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignEdit;
