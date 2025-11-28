import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const Reports = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold mb-2">Izvještaji</h1>
        <p className="text-muted-foreground">Analize i statistika kampanja</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Izvještaj po Kampanji</CardTitle>
            <CardDescription>Detaljni pregled performansi kampanje</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2">
              <FileText className="h-4 w-4" />
              Generiši Izvještaj
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Izvještaj po Kategoriji</CardTitle>
            <CardDescription>Analiza po kategorijama proizvoda</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2">
              <FileText className="h-4 w-4" />
              Generiši Izvještaj
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM Statistika</CardTitle>
            <CardDescription>Statistika preporuka AI modela</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2">
              <Download className="h-4 w-4" />
              Izvezi CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konkurentska Analiza</CardTitle>
            <CardDescription>Poređenje sa konkurencijom</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2">
              <Download className="h-4 w-4" />
              Izvezi Excel
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
