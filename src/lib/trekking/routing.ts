export type TrekkingRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

export type GeocodedLocation = {
  label: string;
  lat: number;
  lng: number;
};

export async function searchTrekkingLocations(query: string): Promise<GeocodedLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const response = await fetch(`/api/geocoding/search?q=${encodeURIComponent(trimmed)}`);
  const payload = (await response.json()) as {
    error?: string;
    results?: GeocodedLocation[];
  };

  if (!response.ok || !Array.isArray(payload.results)) {
    throw new Error(payload.error || "Location search failed. Please try again.");
  }

  return payload.results;
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<GeocodedLocation> {
  const response = await fetch(`/api/geocoding/search?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`);
  const payload = (await response.json()) as {
    error?: string;
    label?: string;
    lat?: number;
    lng?: number;
  };

  if ((!response.ok || !payload.label || !Number.isFinite(payload.lat ?? NaN) || !Number.isFinite(payload.lng ?? NaN))) {
    return {
      label: "Selected map location",
      lat,
      lng,
    };
  }

  return {
    label: payload.label,
    lat: payload.lat!,
    lng: payload.lng!,
  };
}

export async function planTrekkingRoute(start: [number, number], destination: [number, number]): Promise<TrekkingRouteResult> {
  const response = await fetch("/api/trekking/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ start, destination }),
  });

  const payload = (await response.json()) as {
    error?: string;
    distanceMeters?: number;
    durationSeconds?: number;
    coordinates?: [number, number][];
  };

  if (!response.ok || !payload.coordinates || payload.coordinates.length === 0) {
    throw new Error(payload.error || "Route calculation failed. Please try again.");
  }

  return {
    distanceMeters: Number(payload.distanceMeters ?? 0),
    durationSeconds: Number(payload.durationSeconds ?? 0),
    coordinates: payload.coordinates,
  };
}
