import { NextResponse } from "next/server";

const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/foot";

function logProviderFailure(provider: string, status: number, message: string) {
  console.error("Provider request failed", {
    provider,
    status,
    message,
  });
}

export async function POST(request: Request) {
  try {
    let body: { start?: [number, number]; destination?: [number, number] };

    try {
      body = (await request.json()) as { start?: [number, number]; destination?: [number, number] };
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const start = body.start;
    const destination = body.destination;

    if (!Array.isArray(start) || start.length !== 2 || !Array.isArray(destination) || destination.length !== 2) {
      return NextResponse.json({ error: "Invalid coordinates provided." }, { status: 400 });
    }

    const [startLng, startLat] = start;
    const [destLng, destLat] = destination;

    if (!Number.isFinite(startLng) || !Number.isFinite(startLat) || !Number.isFinite(destLng) || !Number.isFinite(destLat)) {
      return NextResponse.json({ error: "Coordinates must be numeric." }, { status: 400 });
    }

    const coordinates = `${startLng},${startLat};${destLng},${destLat}`;
    const upstreamUrl = `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`;

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
        typeof upstreamPayload === "object" && upstreamPayload !== null
          ? (() => {
              const candidate = upstreamPayload as {
                code?: string;
                error?: string;
                message?: string;
              };
              if (candidate.code) return candidate.code;
              if (candidate.error) return candidate.error;
              if (candidate.message) return candidate.message;
              return upstream.statusText || "Route calculation failed.";
            })()
          : typeof upstreamPayload === "string" && upstreamPayload.trim()
            ? upstreamPayload.trim()
            : upstream.statusText || "Route calculation failed.";

      logProviderFailure("osrm", upstream.status, upstreamError);
      return NextResponse.json({ error: "Route calculation failed. Please try again." }, { status: upstream.status >= 500 ? 502 : 400 });
    }

    const data = (typeof upstreamPayload === "object" && upstreamPayload !== null
      ? (upstreamPayload as {
          routes?: Array<{
            distance?: number;
            duration?: number;
            geometry?: { coordinates?: [number, number][] };
          }>;
        })
      : {}) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };

    const route = data.routes?.[0];
    const geometry = route?.geometry?.coordinates ?? [];

    if (!route || geometry.length === 0) {
      return NextResponse.json({ error: "No trekking route found for those coordinates." }, { status: 404 });
    }

    const coordinatesForLeaflet = geometry.map(([lng, lat]) => [lat, lng] as [number, number]);

    return NextResponse.json({
      distanceMeters: Number(route.distance ?? 0),
      durationSeconds: Number(route.duration ?? 0),
      coordinates: coordinatesForLeaflet,
    });
  } catch (error) {
    console.error("Trekking route API error:", error);
    return NextResponse.json({ error: "Route calculation failed. Please try again." }, { status: 500 });
  }
}
