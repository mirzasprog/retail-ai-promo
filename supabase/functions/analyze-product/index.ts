import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productId, proposedPrice, campaignId } = await req.json();

    if (!productId || !proposedPrice) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch product details
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      console.error("Product fetch error:", productError);
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch competitor prices
    const { data: competitorPrices } = await supabase
      .from("competitor_prices")
      .select("*, competitors(*)")
      .eq("product_ean", product.ean)
      .order("fetched_at", { ascending: false })
      .limit(5);

    // Get current context (weather, season, etc.)
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString("bs-BA", { weekday: "long" });
    const month = now.getMonth() + 1;
    const season = month >= 3 && month <= 5 ? "Proljeće" :
                   month >= 6 && month <= 8 ? "Ljeto" :
                   month >= 9 && month <= 11 ? "Jesen" : "Zima";
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Check for holidays
    const { data: holidays } = await supabase
      .from("holidays")
      .select("*")
      .gte("date", now.toISOString().split("T")[0])
      .lte("date", new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

    // Build context for LLM
    const context = {
      product: {
        name: product.name,
        category: product.category,
        brand: product.brand,
        regularPrice: product.regular_price,
        seasonality: product.seasonality,
      },
      proposedPrice,
      competitorPrices: competitorPrices?.map(cp => ({
        competitor: cp.competitors?.name,
        regularPrice: cp.regular_price,
        promoPrice: cp.promo_price,
      })) || [],
      context: {
        dayOfWeek,
        season,
        isWeekend,
        upcomingHolidays: holidays?.map(h => h.name) || [],
      },
    };

    console.log("Analyzing product with context:", JSON.stringify(context, null, 2));

    // Call LLM
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `Ti si stručnjak za retail pricing i planiranje akcija u Bosni i Hercegovini. 
Tvoj zadatak je da analiziraš da li je artikal dobar kandidat za katalog/akciju i da li je predložena cijena dobra.

Uzmi u obzir:
- Cijene konkurenata
- Trenutni kontekst (sezona, dan u sedmici, praznici)
- Karakteristike proizvoda (sezonalnost, kategorija)
- Marže i profitabilnost

VAŽNO: Odgovori SAMO u JSON formatu bez dodatnog teksta.`;

    const userPrompt = `Analiziraj sljedeći proizvod za akciju:

${JSON.stringify(context, null, 2)}

Odgovori u JSON formatu sa sljedećim poljima:
{
  "is_item_good": boolean,
  "item_score": number (0-100),
  "is_price_good": boolean,
  "recommended_price": number ili null,
  "recommended_substitutes": array proizvoda ili [],
  "reasoning_bs": "Detaljno objašnjenje na bosanskom jeziku"
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";
    
    // Parse LLM response
    let evaluation;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      evaluation = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      evaluation = {
        is_item_good: true,
        item_score: 70,
        is_price_good: true,
        recommended_price: null,
        recommended_substitutes: [],
        reasoning_bs: "AI analiza je generirana ali format odgovora nije validan. Preporučuje se manuelna provjera.",
      };
    }

    console.log("AI Evaluation:", evaluation);

    return new Response(
      JSON.stringify({
        success: true,
        evaluation,
        context,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-product:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
