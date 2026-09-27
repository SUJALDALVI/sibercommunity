import { NextResponse } from "next/server";

const PHOTON_SEARCH_URL = "https://photon.komoot.io/api";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";

function buildReadablePhotonLabel(properties: Record<string, unknown>): string {
  const parts = [
    properties.name,
    properties.street,
    properties.city,
    properties.state,
    properties.country,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return "Selected map location";
}

function logProviderFailure(provider: string, status: number, message: string) {
  console.error("Provider request failed", {
    provider,
    status,
    message,
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? searchParams.get("text") ?? "";
    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");

    if (latParam && lonParam) {
      const lat = Number(latParam);
      const lon = Number(lonParam);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
      }

      const upstreamUrl = new URL(PHOTON_REVERSE_URL);
      upstreamUrl.searchParams.set("lat", String(lat));
      upstreamUrl.searchParams.set("lon", String(lon));

      const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const upstreamBodyText = await upstream.text();
      let upstreamPayload: unknown = null;
      try {
        upstreamPayload = upstreamBodyText ? JSON.parse(upstreamBodyText) : null;
      } catch {
        upstreamPayload = upstreamBodyText;
      }

      if (!upstream.ok) {
        const upstreamError =
          typeof upstreamPayload === "object" && upstreamPayload !== null && "message" in upstreamPayload
            ? String((upstreamPayload as { message?: unknown }).message ?? upstream.statusText)
            : typeof upstreamPayload === "string" && upstreamPayload.trim()
              ? upstreamPayload.trim()
              : upstream.statusText || "Unable to resolve location.";

        logProviderFailure("Photon reverse geocoding", upstream.status, upstreamError);
        return NextResponse.json({ error: "Location search failed. Please try again." }, { status: upstream.status >= 500 ? 502 : 400 });
      }

      const data = (typeof upstreamPayload === "object" && upstreamPayload !== null
        ? (upstreamPayload as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> })
        : {}) as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> };

      const feature = data.features?.[0];
      const featureProperties = feature?.properties ?? {};
      const geometryCoordinates = feature?.geometry?.coordinates ?? [lon, lat];
      const resolvedLng = Number(geometryCoordinates[0]);
      const resolvedLat = Number(geometryCoordinates[1]);
      const label = buildReadablePhotonLabel(featureProperties) || "Selected map location";

      if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) {
        return NextResponse.json({
          label: "Selected map location",
          lat,
          lng: lon,
        });
      }

      return NextResponse.json({
        label,
        lat: resolvedLat,
        lng: resolvedLng,
      });
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      return NextResponse.json({ error: "Search query is too short." }, { status: 400 });
    }

    const upstreamUrl = new URL(PHOTON_SEARCH_URL);
    upstreamUrl.searchParams.set("q", trimmedQuery);
    upstreamUrl.searchParams.set("limit", "5");

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const upstreamBodyText = await upstream.text();
    let upstreamPayload: unknown = null;
    try {
      upstreamPayload = upstreamBodyText ? JSON.parse(upstreamBodyText) : null;
    } catch {
      upstreamPayload = upstreamBodyText;
    }

    if (!upstream.ok) {
      const upstreamError =
        typeof upstreamPayload === "object" && upstreamPayload !== null && "message" in upstreamPayload
          ? String((upstreamPayload as { message?: unknown }).message ?? upstream.statusText)
          : typeof upstreamPayload === "string" && upstreamPayload.trim()
            ? upstreamPayload.trim()
            : upstream.statusText || "Unable to search location.";

      logProviderFailure("Photon search", upstream.status, upstreamError);
      return NextResponse.json({ error: "Location search failed. Please try again." }, { status: upstream.status >= 500 ? 502 : 400 });
    }

    const data = (typeof upstreamPayload === "object" && upstreamPayload !== null
      ? (upstreamPayload as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> })
      : {}) as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> };

    const results = (data.features ?? [])
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates ?? [];
        const lat = Number(coordinates[1]);
        const lng = Number(coordinates[0]);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const label = buildReadablePhotonLabel(feature.properties ?? {});

        return {
          label,
          lat,
          lng,
        };
      })
      .filter((item): item is { label: string; lat: number; lng: number } => Boolean(item));

    return NextResponse.json({ results: results.slice(0, 5) });
  } catch (error) {
    console.error("Photon geocoding API error:", error);
    return NextResponse.json({ error: "Location search failed. Please try again." }, { status: 500 });
  }
}
