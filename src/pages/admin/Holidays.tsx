import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Plus, Pencil, Trash2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Holiday {
  id: string;
  name: string;
  date: string;
  is_recurring: boolean;
  created_at: string;
}

const Holidays = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    date: "",
    is_recurring: false,
  });

  useEffect(() => {
    loadHolidays();
  }, []);

  const loadHolidays = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("date", { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
    } catch (error) {
      console.error("Error loading holidays:", error);
      toast({
        title: "Greška",
        description: "Nije moguće učitati praznike",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      date: "",
      is_recurring: false,
    });
    setEditingHoliday(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: holiday.date,
      is_recurring: holiday.is_recurring,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.date) {
      toast({
        title: "Validacija",
        description: "Molimo popunite sva obavezna polja",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingHoliday) {
        // Update existing holiday
        const { error } = await supabase
          .from("holidays")
          .update({
            name: formData.name.trim(),
            date: formData.date,
            is_recurring: formData.is_recurring,
          })
          .eq("id", editingHoliday.id);

        if (error) throw error;

        toast({
          title: "Uspješno",
          description: "Praznik je ažuriran",
        });
      } else {
        // Create new holiday
        const { error } = await supabase
          .from("holidays")
          .insert({
            name: formData.name.trim(),
            date: formData.date,
            is_recurring: formData.is_recurring,
          });

        if (error) throw error;

        toast({
          title: "Uspješno",
          description: "Praznik je dodat",
        });
      }

      setDialogOpen(false);
      resetForm();
      loadHolidays();
    } catch (error) {
      console.error("Error saving holiday:", error);
      toast({
        title: "Greška",
        description: "Nije moguće sačuvati praznik",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingHolidayId(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingHolidayId) return;

    try {
      const { error } = await supabase
        .from("holidays")
        .delete()
        .eq("id", deletingHolidayId);

      if (error) throw error;

      toast({
        title: "Uspješno",
        description: "Praznik je obrisan",
      });

      setDeleteDialogOpen(false);
      setDeletingHolidayId(null);
      loadHolidays();
    } catch (error) {
      console.error("Error deleting holiday:", error);
      toast({
        title: "Greška",
        description: "Nije moguće obrisati praznik",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd.MM.yyyy");
    } catch {
      return dateStr;
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
          <h1 className="text-4xl font-bold">Praznici</h1>
          <p className="text-muted-foreground">Definisanje godišnjih praznika za AI evaluaciju</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj Praznik
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Praznični Kalendar</CardTitle>
          <CardDescription>
            Upravljanje prazničnim danima koji se koriste u AI analizi promocija
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Učitavanje...</p>
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Nema definisanih praznika</p>
              <Button onClick={openAddDialog} variant="outline" className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Dodaj Prvi Praznik
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naziv</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Recurring</TableHead>
                  <TableHead className="text-right">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((holiday) => (
                  <TableRow key={holiday.id}>
                    <TableCell className="font-medium">{holiday.name}</TableCell>
                    <TableCell>{formatDate(holiday.date)}</TableCell>
                    <TableCell>
                      {holiday.is_recurring ? (
                        <span className="text-green-600">Da</span>
                      ) : (
                        <span className="text-muted-foreground">Ne</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(holiday)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmDelete(holiday.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingHoliday ? "Uredi Praznik" : "Dodaj Novi Praznik"}
              </DialogTitle>
              <DialogDescription>
                Unesite informacije o prazniku koji se koristi u AI analizi
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Naziv Praznika *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="npr. Nova Godina"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Datum *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_recurring"
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_recurring: checked as boolean })
                  }
                />
                <Label htmlFor="is_recurring" className="cursor-pointer">
                  Recurring (ponavlja se svake godine)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Odustani
              </Button>
              <Button type="submit">
                {editingHoliday ? "Sačuvaj Izmjene" : "Dodaj Praznik"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Da li ste sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova akcija ne može biti poništena. Praznik će biti trajno obrisan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingHolidayId(null)}>
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Holidays;