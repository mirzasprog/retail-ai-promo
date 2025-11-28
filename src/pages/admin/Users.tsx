import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Users = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsersAndRoles();
  }, []);

  const fetchUsersAndRoles = async () => {
    setLoading(true);
    try {
      const [{ data: profilesData, error: profilesError }, { data: rolesData, error: rolesError }] =
        await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("user_roles").select("*"),
        ]);

      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;

      setUsers(profilesData || []);
      setUserRoles(rolesData || []);
    } catch (error: any) {
      console.error("Greška pri učitavanju korisnika:", error);
      toast.error("Greška pri učitavanju korisnika");
    } finally {
      setLoading(false);
    }
  };

  const getUserRoles = (userId: string) => {
    return userRoles.filter((ur) => ur.user_id === userId).map((ur) => ur.role);
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert({ 
          user_id: userId, 
          role: role as "admin" | "category_manager" | "viewer" 
        });

      if (error) throw error;

      toast.success("Rola dodana");
      fetchUsersAndRoles();
    } catch (error: any) {
      console.error("Greška pri dodavanju role:", error);
      toast.error("Greška pri dodavanju role: " + error.message);
    }
  };

  const removeRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role as "admin" | "category_manager" | "viewer");

      if (error) throw error;

      toast.success("Rola uklonjena");
      fetchUsersAndRoles();
    } catch (error: any) {
      console.error("Greška pri uklanjanju role:", error);
      toast.error("Greška pri uklanjanju role: " + error.message);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "category_manager":
        return "default";
      case "viewer":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "category_manager":
        return "Category Manager";
      case "viewer":
        return "Viewer";
      default:
        return role;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Nazad
        </Button>
        <div>
          <h1 className="text-4xl font-bold">Korisnici i Role</h1>
          <p className="text-muted-foreground">Upravljanje pristupom i dozvolama</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Svi Korisnici</CardTitle>
          <CardDescription>
            Pregled svih korisnika sistema i njihovih rola
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Učitavanje...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nema korisnika u sistemu</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Ime</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const roles = getUserRoles(user.id);
                  const availableRoles = ["admin", "category_manager", "viewer"].filter(
                    (r) => !roles.includes(r)
                  );

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {roles.length > 0 ? (
                            roles.map((role) => (
                              <Badge key={role} variant={getRoleBadgeVariant(role)}>
                                {getRoleLabel(role)}
                                <button
                                  onClick={() => removeRole(user.id, role)}
                                  className="ml-1 hover:text-destructive"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">Nema rola</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {availableRoles.length > 0 && (
                          <Select onValueChange={(role) => addRole(user.id, role)}>
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Dodaj rolu" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {getRoleLabel(role)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Users;
