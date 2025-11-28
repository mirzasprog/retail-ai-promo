-- Kreiranje enumeracija
CREATE TYPE public.app_role AS ENUM ('admin', 'category_manager', 'viewer');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE public.source_type AS ENUM ('api', 'html', 'csv');

-- User roles tabela (MUST be separate from profiles!)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Sigurnosna funkcija za provjeru role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- User profili tabela
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger za kreiranje profila
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Proizvodi (Products)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    ean TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT,
    regular_price DECIMAL(10,2),
    seasonality TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Konkurenti (Competitors)
CREATE TABLE public.competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    source_type source_type NOT NULL,
    base_url TEXT NOT NULL,
    refresh_interval INTEGER DEFAULT 3600,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;

-- Cijene konkurenata (CompetitorPrice)
CREATE TABLE public.competitor_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE NOT NULL,
    product_ean TEXT,
    product_name TEXT NOT NULL,
    regular_price DECIMAL(10,2),
    promo_price DECIMAL(10,2),
    promo_start_date DATE,
    promo_end_date DATE,
    location TEXT,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.competitor_prices ENABLE ROW LEVEL SECURITY;

-- Kampanje (CampaignScenario)
CREATE TABLE public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status campaign_status DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Artikli u kampanji (CampaignScenarioItem)
CREATE TABLE public.campaign_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) NOT NULL,
    proposed_price DECIMAL(10,2) NOT NULL,
    final_price DECIMAL(10,2),
    llm_result_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.campaign_items ENABLE ROW LEVEL SECURITY;

-- LLM rezultati evaluacije (LLMEvaluationResult)
CREATE TABLE public.llm_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_item_id UUID REFERENCES public.campaign_items(id) ON DELETE CASCADE NOT NULL,
    is_item_good BOOLEAN NOT NULL,
    item_score INTEGER CHECK (item_score >= 0 AND item_score <= 100),
    is_price_good BOOLEAN NOT NULL,
    recommended_price DECIMAL(10,2),
    recommended_substitutes JSONB,
    reasoning TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.llm_evaluations ENABLE ROW LEVEL SECURITY;

-- Vremenski snimak (WeatherSnapshot)
CREATE TABLE public.weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    temperature DECIMAL(5,2),
    weather_type TEXT NOT NULL,
    location TEXT NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.weather_snapshots ENABLE ROW LEVEL SECURITY;

-- Kontekstualni snimak (ContextSnapshot)
CREATE TABLE public.context_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week TEXT NOT NULL,
    season TEXT NOT NULL,
    is_weekend BOOLEAN NOT NULL,
    is_holiday BOOLEAN NOT NULL,
    holiday_name TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.context_snapshots ENABLE ROW LEVEL SECURITY;

-- Praznici
CREATE TABLE public.holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- System settings
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies za profiles
CREATE POLICY "Korisnici mogu vidjeti svoj profil"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Korisnici mogu ažurirati svoj profil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- RLS Policies za user_roles
CREATE POLICY "Admini mogu vidjeti sve role"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admini mogu upravljati rolama"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies za products
CREATE POLICY "Svi autentifikovani mogu vidjeti proizvode"
ON public.products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admini i category manageri mogu upravljati proizvodima"
ON public.products FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'category_manager')
);

-- RLS Policies za campaigns
CREATE POLICY "Svi autentifikovani mogu vidjeti kampanje"
ON public.campaigns FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admini i category manageri mogu kreirati kampanje"
ON public.campaigns FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'category_manager')
);

CREATE POLICY "Kreatori i admini mogu ažurirati kampanje"
ON public.campaigns FOR UPDATE
USING (
  created_by = auth.uid() OR 
  public.has_role(auth.uid(), 'admin')
);

-- RLS Policies za campaign_items
CREATE POLICY "Svi autentifikovani mogu vidjeti stavke kampanje"
ON public.campaign_items FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admini i category manageri mogu upravljati stavkama"
ON public.campaign_items FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'category_manager')
);

-- RLS Policies za ostale tabele
CREATE POLICY "Svi autentifikovani mogu čitati konkurente"
ON public.competitors FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admini upravljaju konkurentima"
ON public.competitors FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Svi autentifikovani mogu čitati cijene"
ON public.competitor_prices FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Svi autentifikovani mogu čitati evaluacije"
ON public.llm_evaluations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Svi autentifikovani mogu čitati vremenske podatke"
ON public.weather_snapshots FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Svi autentifikovani mogu čitati kontekst"
ON public.context_snapshots FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Svi autentifikovani mogu čitati praznike"
ON public.holidays FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admini upravljaju praznicima"
ON public.holidays FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admini čitaju system settings"
ON public.system_settings FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admini upravljaju system settings"
ON public.system_settings FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Funkcija za ažuriranje updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggeri za updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();