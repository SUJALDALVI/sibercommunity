import { NextRequest, NextResponse } from "next/server";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

interface FdcFoodItem {
  fdcId: number;
  description: string;
  brandName?: string;
  foodNutrients?: Array<{
    nutrientId: number;
    nutrientName: string;
    unitName: string;
    value: number;
  }>;
  servingSize?: number;
  servingSizeUnit?: string;
}

function extractNutrients(food: FdcFoodItem) {
  const map: Record<number, number> = {};
  for (const n of food.foodNutrients ?? []) {
    map[n.nutrientId] = n.value;
  }
  // USDA nutrient IDs: 1008=Energy(kcal), 1003=Protein, 1005=Carbs, 1004=Fat, 1079=Fiber
  return {
    calories: map[1008] ?? null,
    protein_g: map[1003] ?? null,
    carbs_g: map[1005] ?? null,
    fat_g: map[1004] ?? null,
    fiber_g: map[1079] ?? null,
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.USDA_FDC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "USDA_FDC_API_KEY is not configured. Use manual food entry instead.", foods: [] },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 10), 25);

  if (!query || query.length < 2) {
    return NextResponse.json({ foods: [] });
  }

  try {
    const url = `${FDC_BASE}/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=${pageSize}&dataType=Foundation,SR%20Legacy,Branded`;

    const res = await fetch(url, { next: { revalidate: 300 } });

    if (!res.ok) {
      return NextResponse.json({ error: "Food search unavailable.", foods: [] }, { status: 502 });
    }

    const json = (await res.json()) as { foods?: FdcFoodItem[] };

    const foods = (json.foods ?? []).map((f) => ({
      fdc_id: String(f.fdcId),
      name: f.description,
      brand: f.brandName ?? null,
      serving_size: f.servingSize ?? 100,
      serving_unit: f.servingSizeUnit ?? "g",
      ...extractNutrients(f),
    }));

    return NextResponse.json({ foods });
  } catch {
    return NextResponse.json({ error: "Food search failed.", foods: [] }, { status: 500 });
  }
}
