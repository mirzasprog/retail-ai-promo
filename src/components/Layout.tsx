import { ReactNode, useState, useEffect, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Megaphone,
  Settings,
  LogOut,
  User,
  ShoppingCart,
  FileText,
} from "lucide-react";
import { Session, User as SupabaseUser } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState<Database["public"]["Enums"]["app_role"] | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          fetchRole(session.user.id);
        }, 0);
      }

      setAuthInitialized(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRole(session.user.id);
      }

      setAuthInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data);
  };

  const fetchRole = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching role", error);
      toast.error("Nije moguće učitati korisničku ulogu");
      return;
    }

    setUserRole(data?.role ?? null);
  };

  useEffect(() => {
    if (!authInitialized) return;

    if (!user && location.pathname !== "/auth") {
      navigate("/auth");
    } else if (user && location.pathname === "/auth") {
      navigate("/");
    }
  }, [user, location.pathname, navigate, authInitialized]);

  useEffect(() => {
    if (!userRole) return;

    const adminOnlyPaths = ["/admin", "/admin/users", "/admin/api-keys", "/admin/competitors", "/admin/holidays", "/admin/settings"];
    if (userRole !== "admin" && adminOnlyPaths.includes(location.pathname)) {
      toast.warning("Nemate dozvolu za pristup admin modulu");
      navigate("/");
    }

    if (userRole === "viewer" && location.pathname.startsWith("/campaigns")) {
      toast.warning("Pregledni nalog nema pristup uređivanju kampanja");
      navigate("/");
    }
  }, [userRole, location.pathname, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Uspješno ste se odjavili");
    navigate("/auth");
  };

  const navItems = useMemo(
    () => [
      { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "category_manager", "viewer"] },
      { path: "/campaigns", label: "Kampanje", icon: Megaphone, roles: ["admin", "category_manager"] },
      { path: "/reports", label: "Izvještaji", icon: FileText, roles: ["admin", "category_manager", "viewer"] },
      { path: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
    ],
    []
  );

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold">Retail Planning</span>
                <span className="text-xs text-muted-foreground">AI Powered</span>
              </div>
            </Link>
            <nav className="hidden md:flex gap-1">
              {navItems
                .filter((item) => (userRole ? item.roles.includes(userRole) : true))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.path} to={item.path}>
                      <Button
                        variant={location.pathname === item.path ? "secondary" : "ghost"}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
            </nav>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">{profile?.full_name || user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Moj Nalog</DropdownMenuLabel>
              {userRole && (
                <DropdownMenuItem disabled className="flex justify-between">
                  <span>Uloga</span>
                  <span className="font-medium capitalize">{userRole.replace("_", " ")}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Odjavi se
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      
      <main className="container px-4 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
