import { supabase } from "@/lib/supabase/supabase";

export type CommunityLocationType =
  | "start"
  | "checkpoint"
  | "campsite"
  | "water"
  | "viewpoint"
  | "danger"
  | "destination"
  | "other";

export type CommunityLocation = {
  id: string;
  community_id: string;
  created_by: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  location_type: CommunityLocationType;
  created_at: string;
};

export async function fetchCommunityLocations(communityId: string): Promise<CommunityLocation[]> {
  const { data, error } = await supabase
    .from("community_locations")
    .select("*")
    .eq("community_id", communityId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityLocation[];
}

export async function createCommunityLocation(payload: {
  communityId: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  locationType: CommunityLocationType;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to add a location.");

  const { error } = await supabase.from("community_locations").insert({
    community_id: payload.communityId,
    created_by: user.id,
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    latitude: payload.latitude,
    longitude: payload.longitude,
    location_type: payload.locationType,
  });

  if (error) throw new Error(error.message);
}

export async function updateCommunityLocation(locationId: string, updates: Partial<Pick<CommunityLocation, "name" | "description" | "location_type">>) {
  const { error } = await supabase.from("community_locations").update(updates).eq("id", locationId);
  if (error) throw new Error(error.message);
}

export async function deleteCommunityLocation(locationId: string) {
  const { error } = await supabase.from("community_locations").delete().eq("id", locationId);
  if (error) throw new Error(error.message);
}

export function subscribeToLocations(communityId: string, onLocations: (locations: CommunityLocation[]) => void) {
  const channel = supabase
    .channel(`trekking_locations_${communityId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_locations", filter: `community_id=eq.${communityId}` },
      async () => {
        const locations = await fetchCommunityLocations(communityId);
        onLocations(locations);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
