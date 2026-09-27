"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { ArrowLeft, CheckCircle2, ClipboardList, MapPinned, Search, Trash2, X } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useAuth from "@/hooks/useAuth";

import {
  closeCommunityPoll,
  createCommunityPoll,
  fetchCommunityPolls,
  subscribeToPolls,
  voteOnPoll,
  type CommunityPoll,
} from "@/lib/trekking/polls";
import {
  createCommunityChecklist,
  deleteChecklistItem,
  fetchCommunityChecklists,
  subscribeToChecklists,
  toggleChecklistItem,
  type CommunityChecklist,
} from "@/lib/trekking/checklists";
import {
  createCommunityLocation,
  fetchCommunityLocations,
  subscribeToLocations,
  type CommunityLocation,
} from "@/lib/trekking/locations";
import { planTrekkingRoute, reverseGeocodeLocation, searchTrekkingLocations, type GeocodedLocation } from "@/lib/trekking/routing";

const TOOL_TABS = ["polls", "checklist", "map"] as const;
type ToolTab = (typeof TOOL_TABS)[number];

function createMarkerIcon() {
  return L.divIcon({
    className: "trek-marker",
    html: '<span style="display:flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:9999px; background:#ef4444; border:2px solid white; box-shadow:0 0 0 2px rgba(239,68,68,0.2);"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function createRouteMarkerIcon(color: "green" | "red", glyph: string) {
  return L.divIcon({
    className: "trek-route-marker",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;border:2px solid rgba(255,255,255,0.8);background:${color === "green" ? "#22c55e" : "#ef4444"};box-shadow:0 0 0 3px rgba(15,15,20,0.35);font-size:14px;line-height:1;">${glyph}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function MapClickHandler({
  onClick,
  disabled,
}: {
  onClick: (latlng: { lat: number; lng: number }) => void;
  disabled: boolean;
}) {
  useMapEvents({
    click: (event) => {
      if (disabled) return;
      onClick(event.latlng);
    },
  });

  return null;
}

const defaultCenter: [number, number] = [46.5197, 6.6323];

const executeLocationSearch = async (query: string, target: "start" | "destination", handlers: {
  setResults: (results: GeocodedLocation[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string) => void;
  requestCounter: React.MutableRefObject<number>;
}) => {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    handlers.setResults([]);
    return;
  }

  const requestId = ++handlers.requestCounter.current;
  handlers.setLoading(true);

  try {
    const results = await searchTrekkingLocations(trimmedQuery);
    if (requestId !== handlers.requestCounter.current) return;
    handlers.setResults(results);
  } catch {
    if (requestId !== handlers.requestCounter.current) return;
    handlers.setResults([]);
    handlers.setError("Location search failed. Please try again.");
  } finally {
    if (requestId === handlers.requestCounter.current) {
      handlers.setLoading(false);
    }
  }
};

function MapBoundsController({
  startLocation,
  destinationLocation,
  route,
}: {
  startLocation: GeocodedLocation | null;
  destinationLocation: GeocodedLocation | null;
  route: { coordinates: [number, number][] } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (route && route.coordinates.length > 0) {
      map.fitBounds(route.coordinates, { padding: [30, 30] });
      return;
    }

    if (startLocation && destinationLocation) {
      map.fitBounds(
        [
          [startLocation.lat, startLocation.lng],
          [destinationLocation.lat, destinationLocation.lng],
        ],
        { padding: [30, 30] }
      );
      return;
    }

    if (startLocation) {
      map.setView([startLocation.lat, startLocation.lng], 12);
      return;
    }

    if (destinationLocation) {
      map.setView([destinationLocation.lat, destinationLocation.lng], 12);
    }
  }, [destinationLocation, map, route, startLocation]);

  return null;
}

export default function TrekkingToolsPanel({
  communityId,
  activeTab,
  onClose,
}: {
  communityId: string;
  activeTab: ToolTab;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [polls, setPolls] = useState<CommunityPoll[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollError, setPollError] = useState("");
  const [checklists, setChecklists] = useState<CommunityChecklist[]>([]);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [checklistItems, setChecklistItems] = useState([""]);
  const [locations, setLocations] = useState<CommunityLocation[]>([]);
  const [route, setRoute] = useState<{ distanceMeters: number; durationSeconds: number; coordinates: [number, number][] } | null>(null);
  const [routeError, setRouteError] = useState("");
  const [planningRoute, setPlanningRoute] = useState(false);
  const [startSearchQuery, setStartSearchQuery] = useState("");
  const [destinationSearchQuery, setDestinationSearchQuery] = useState("");
  const [startSearchResults, setStartSearchResults] = useState<GeocodedLocation[]>([]);
  const [destinationSearchResults, setDestinationSearchResults] = useState<GeocodedLocation[]>([]);
  const [startSearchLoading, setStartSearchLoading] = useState(false);
  const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"start" | "destination" | null>(null);
  const [startLocation, setStartLocation] = useState<GeocodedLocation | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<GeocodedLocation | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [newLocationForm, setNewLocationForm] = useState({
    name: "",
    description: "",
    type: "checkpoint" as CommunityLocation["location_type"],
  });
  const geocodeRequestCounter = useRef(0);

  useEffect(() => {
    let active = true;
    void fetchCommunityPolls(communityId).then((data) => {
      if (active) setPolls(data);
    });
    void fetchCommunityChecklists(communityId).then((data) => {
      if (active) setChecklists(data);
    });
    void fetchCommunityLocations(communityId).then((data) => {
      if (active) setLocations(data);
    });

    return () => {
      active = false;
    };
  }, [communityId]);

  useEffect(() => {
    const pollUnsub = subscribeToPolls(communityId, setPolls);
    const checklistUnsub = subscribeToChecklists(communityId, setChecklists);
    const locationUnsub = subscribeToLocations(communityId, setLocations);

    return () => {
      pollUnsub();
      checklistUnsub();
      locationUnsub();
    };
  }, [communityId]);

  const totalChecklistItems = useMemo(
    () => checklists.reduce((total, checklist) => total + checklist.items.length, 0),
    [checklists]
  );
  const completedChecklistItems = useMemo(
    () => checklists.reduce((total, checklist) => total + checklist.items.filter((item) => item.completed).length, 0),
    [checklists]
  );

  const handleAddPollOption = () => setPollOptions((current) => [...current, ""]);
  const handlePollOptionChange = (index: number, value: string) => {
    setPollOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };
  const handleRemovePollOption = (index: number) => {
    setPollOptions((current) => (current.length > 2 ? current.filter((_, itemIndex) => itemIndex !== index) : current));
  };

  const handleCreatePoll = async () => {
    const trimmedQuestion = pollQuestion.trim();
    const cleanedOptions = pollOptions.map((option) => option.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      setPollError("Poll question is required.");
      return;
    }

    if (cleanedOptions.length < 2) {
      setPollError("Add at least two options.");
      return;
    }

    try {
      setPollError("");
      await createCommunityPoll(communityId, trimmedQuestion, cleanedOptions);
      const refreshedPolls = await fetchCommunityPolls(communityId);
      setPolls(refreshedPolls);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Unable to create poll.");
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      await voteOnPoll(pollId, optionId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    try {
      await closeCommunityPoll(pollId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateChecklist = async () => {
    const trimmedTitle = checklistTitle.trim();
    const cleanedItems = checklistItems.map((item) => item.trim()).filter(Boolean);

    if (!trimmedTitle) {
      console.error("Checklist title is required.");
      return;
    }

    if (cleanedItems.length === 0) {
      console.error("Add at least one checklist item.");
      return;
    }

    try {
      await createCommunityChecklist(communityId, trimmedTitle, cleanedItems);
      const refreshedChecklists = await fetchCommunityChecklists(communityId);
      setChecklists(refreshedChecklists);
      setChecklistTitle("");
      setChecklistItems([""]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddChecklistItem = () => setChecklistItems((current) => [...current, ""]);
  const handleChecklistItemChange = (index: number, value: string) => {
    setChecklistItems((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };
  const handleChecklistItemDelete = async (itemId: string) => {
    try {
      await deleteChecklistItem(itemId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveLocation = async () => {
    if (!pendingLocation) return;
    if (!newLocationForm.name.trim()) return;

    try {
      await createCommunityLocation({
        communityId,
        name: newLocationForm.name,
        description: newLocationForm.description,
        latitude: pendingLocation.lat,
        longitude: pendingLocation.lng,
        locationType: newLocationForm.type,
      });
      const refreshedLocations = await fetchCommunityLocations(communityId);
      setLocations(refreshedLocations);
      setPendingLocation(null);
      setNewLocationForm({ name: "", description: "", type: "checkpoint" });
    } catch (error) {
      console.error(error);
    }
  };

  const handlePlanRoute = async () => {
    if (!startLocation || !destinationLocation) {
      setRouteError("Select both a start and destination before planning the route.");
      return;
    }

    try {
      setRouteError("");
      setPlanningRoute(true);
      const routeData = await planTrekkingRoute(
        [startLocation.lng, startLocation.lat],
        [destinationLocation.lng, destinationLocation.lat]
      );
      setRoute(routeData);
    } catch {
      setRouteError("Route calculation failed. Please try again.");
      setRoute(null);
    } finally {
      setPlanningRoute(false);
    }
  };

  const handleLocationSearch = async (query: string, target: "start" | "destination") => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      if (target === "start") setStartSearchResults([]);
      else setDestinationSearchResults([]);
      return;
    }

    const requestId = ++geocodeRequestCounter.current;
    if (target === "start") setStartSearchLoading(true);
    else setDestinationSearchLoading(true);

    try {
      const results = await searchTrekkingLocations(trimmedQuery);
      if (requestId !== geocodeRequestCounter.current) return;

      if (target === "start") setStartSearchResults(results);
      else setDestinationSearchResults(results);
    } catch {
      if (requestId !== geocodeRequestCounter.current) return;
      if (target === "start") {
        setStartSearchResults([]);
      } else {
        setDestinationSearchResults([]);
      }
      setRouteError("Location search failed. Please try again.");
    } finally {
      if (requestId === geocodeRequestCounter.current) {
        if (target === "start") setStartSearchLoading(false);
        else setDestinationSearchLoading(false);
      }
    }
  };

  const triggerSearch = (target: "start" | "destination") => {
    const query = target === "start" ? startSearchQuery : destinationSearchQuery;
    void handleLocationSearch(query, target);
  };

  const renderLocationPicker = ({
    label,
    kind,
    selectedLocation,
    query,
    setQuery,
    results,
    loading,
    onSelect,
    onUseCurrentLocation,
    onClear,
  }: {
    label: string;
    kind: "start" | "destination";
    selectedLocation: GeocodedLocation | null;
    query: string;
    setQuery: (value: string) => void;
    results: GeocodedLocation[];
    loading: boolean;
    onSelect: (location: GeocodedLocation) => void;
    onUseCurrentLocation?: () => void;
    onClear: () => void;
  }) => {
    if (selectedLocation) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2">
            <span className="text-base">📍</span>
            <span className="min-w-0 flex-1 truncate text-sm text-white">{selectedLocation.label}</span>
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-medium text-red-300 transition hover:text-red-200"
            >
              Change
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
          {kind === "start" && onUseCurrentLocation ? (
            <button
              type="button"
              onClick={onUseCurrentLocation}
              className="text-[11px] font-medium text-zinc-300 transition hover:text-white"
            >
              Use my current location
            </button>
          ) : null}
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2">
            <Search size={14} className="text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleLocationSearch(query, kind);
                }
              }}
              placeholder={kind === "start" ? "Search starting location..." : "Search destination..."}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => void handleLocationSearch(query, kind)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-200 hover:text-white"
            >
              Search
            </button>
          </div>

          {loading ? (
            <div className="mt-2 rounded-xl border border-white/10 bg-[#111118] px-3 py-2 text-xs text-zinc-400">
              Searching...
            </div>
          ) : null}

          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <div className="mt-2 rounded-xl border border-white/10 bg-[#111118] px-3 py-2 text-xs text-zinc-400">
              No results found
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="absolute left-0 right-0 z-20 mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#111118] p-1 shadow-2xl">
              {results.map((result) => (
                <button
                  key={`${kind}-${result.label}-${result.lat}-${result.lng}`}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                >
                  <span className="mt-0.5 text-sm">📍</span>
                  <span className="min-w-0 flex-1 text-sm text-zinc-200">{result.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const setLocationFromMapSelection = async (kind: "start" | "destination", latlng: { lat: number; lng: number }) => {
    setSelectionMode(null);
    setRouteError("");

    try {
      const place = await reverseGeocodeLocation(latlng.lat, latlng.lng);

      if (kind === "start") {
        setStartLocation(place);
        setStartSearchQuery(place.label);
        setStartSearchResults([]);
      } else {
        setDestinationLocation(place);
        setDestinationSearchQuery(place.label);
        setDestinationSearchResults([]);
      }
    } catch {
      const fallback: GeocodedLocation = {
        label: "Selected map location",
        lat: latlng.lat,
        lng: latlng.lng,
      };

      if (kind === "start") {
        setStartLocation(fallback);
        setStartSearchQuery(fallback.label);
        setStartSearchResults([]);
      } else {
        setDestinationLocation(fallback);
        setDestinationSearchQuery(fallback.label);
        setDestinationSearchResults([]);
      }
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setRouteError("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: GeocodedLocation = {
          label: "Current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setStartLocation(nextLocation);
        setStartSearchQuery(nextLocation.label);
        setStartSearchResults([]);
        setSelectionMode(null);
        setRouteError("");
      },
      () => {
        setRouteError("Location access was denied. You can still search for a place manually.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      }
    );
  };

  return (
    <div className="border-t border-white/10 bg-[#0d0c12] px-4 py-4 md:px-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={14} />
          Back to Chat
        </button>
      </div>
      {activeTab === "polls" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111118] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <ClipboardList size={15} className="text-red-400" /> Create Poll
            </div>
            {pollError ? <p className="mb-2 text-xs text-red-400">{pollError}</p> : null}
            <input
              value={pollQuestion}
              onChange={(event) => {
                setPollQuestion(event.target.value);
                if (pollError) setPollError("");
              }}
              placeholder="Poll question"
              className="mb-3 w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            {pollOptions.map((option, index) => (
              <div key={index} className="mb-2 flex items-center gap-2">
                <input
                  value={option}
                  onChange={(event) => handlePollOptionChange(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                {pollOptions.length > 2 && (
                  <button type="button" onClick={() => handleRemovePollOption(index)} className="text-zinc-400 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={handleAddPollOption} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">
                + Add option
              </button>
            </div>
            <button type="button" onClick={handleCreatePoll} className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400">
              Create poll
            </button>
          </div>

          <div className="space-y-3">
            {polls.length === 0 ? (
              <p className="text-sm text-zinc-500">No active trekking polls yet.</p>
            ) : (
              polls.map((poll) => {
                const totalVotes = poll.votes.length;
                const userVote = poll.votes.find((vote) => vote.user_id === user?.id);
                const isClosed = Boolean(poll.closed_at);

                return (
                  <div key={poll.id} className="rounded-2xl border border-white/10 bg-[#111118] p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{poll.question}</p>
                      {isClosed ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-amber-300">
                          Closed
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {poll.options.map((option) => {
                        const optionVotes = poll.votes.filter((vote) => vote.option_id === option.id).length;
                        const percent = totalVotes > 0 ? (optionVotes / totalVotes) * 100 : 0;
                        return (
                          <div key={option.id}>
                            <button
                              type="button"
                              disabled={isClosed}
                              onClick={() => handleVote(poll.id, option.id)}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                                userVote?.option_id === option.id ? "border-red-500 bg-red-500/10 text-white" : "border-white/10 bg-[#0d0c12] text-zinc-200 hover:border-white/20"
                              } ${isClosed ? "cursor-not-allowed opacity-70" : ""}`}
                            >
                              <span>{option.option_text}</span>
                              <span>{optionVotes}</span>
                            </button>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                              <div className="h-full rounded-full bg-red-500" style={{ width: `${percent}%` }} />
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-500">{percent.toFixed(0)}%</div>
                          </div>
                        );
                      })}
                    </div>

                    {!isClosed && (
                      <button type="button" onClick={() => handleClosePoll(poll.id)} className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">
                        Close poll
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "checklist" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111118] p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 size={15} className="text-red-400" /> Create Checklist
            </div>
            <input
              value={checklistTitle}
              onChange={(event) => setChecklistTitle(event.target.value)}
              placeholder="Checklist title"
              className="mb-3 w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            {checklistItems.map((item, index) => (
              <div key={index} className="mb-2 flex items-center gap-2">
                <input
                  value={item}
                  onChange={(event) => handleChecklistItemChange(index, event.target.value)}
                  placeholder={`Item ${index + 1}`}
                  className="w-full rounded-xl border border-white/10 bg-[#0d0c12] px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                {checklistItems.length > 1 && (
                  <button type="button" onClick={() => setChecklistItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-zinc-400 hover:text-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={handleAddChecklistItem} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">
                + Add item
              </button>
            </div>
            <button type="button" onClick={handleCreateChecklist} className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400">
              Create checklist
            </button>
          </div>

          <div className="space-y-3">
            {checklists.length === 0 ? (
              <p className="text-sm text-zinc-500">No trekking checklists yet.</p>
            ) : (
              checklists.map((checklist) => {
                const completedCount = checklist.items.filter((item) => item.completed).length;
                const totalCount = checklist.items.length;
                const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

                return (
                  <div key={checklist.id} className="rounded-2xl border border-white/10 bg-[#111118] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{checklist.title}</p>
                      <span className="text-[11px] text-zinc-400">{completedCount}/{totalCount} completed</span>
                    </div>
                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-2">
                      {checklist.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d0c12] px-2 py-2">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => toggleChecklistItem(item.id, !item.completed)}
                            className="h-4 w-4 accent-red-500"
                          />
                          <span className={`flex-1 text-sm ${item.completed ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                            {item.item_text}
                          </span>
                          <button type="button" onClick={() => handleChecklistItemDelete(item.id)} className="text-zinc-400 hover:text-white">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "map" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111118] p-3">
            <div className="mb-3 text-sm font-semibold text-white">Trek Route Planner</div>

            <div className="space-y-3">
              {renderLocationPicker({
                label: "Start Location",
                kind: "start",
                selectedLocation: startLocation,
                query: startSearchQuery,
                setQuery: setStartSearchQuery,
                results: startSearchResults,
                loading: startSearchLoading,
                onSelect: (location) => {
                  setStartLocation(location);
                  setStartSearchQuery(location.label);
                  setStartSearchResults([]);
                  setRouteError("");
                },
                onUseCurrentLocation: handleUseCurrentLocation,
                onClear: () => {
                  setStartLocation(null);
                  setStartSearchQuery("");
                  setStartSearchResults([]);
                  setRouteError("");
                },
              })}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionMode("start")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  Select Start on Map
                </button>
              </div>

              {selectionMode === "start" ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  Click on the map to select the starting point.
                </div>
              ) : null}

              {renderLocationPicker({
                label: "Destination",
                kind: "destination",
                selectedLocation: destinationLocation,
                query: destinationSearchQuery,
                setQuery: setDestinationSearchQuery,
                results: destinationSearchResults,
                loading: destinationSearchLoading,
                onSelect: (location) => {
                  setDestinationLocation(location);
                  setDestinationSearchQuery(location.label);
                  setDestinationSearchResults([]);
                  setRouteError("");
                },
                onClear: () => {
                  setDestinationLocation(null);
                  setDestinationSearchQuery("");
                  setDestinationSearchResults([]);
                  setRouteError("");
                },
              })}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectionMode("destination")}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  Select Destination on Map
                </button>
              </div>

              {selectionMode === "destination" ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  Click on the map to select the destination.
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void handlePlanRoute();
                }}
                disabled={!startLocation || !destinationLocation || planningRoute}
                className="rounded-xl bg-red-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {planningRoute ? "Planning route..." : "Plan Trek Route"}
              </button>
              {route && (
                <div className="text-xs text-zinc-400">
                  {Math.round(route.distanceMeters / 1000)} km · {(route.durationSeconds / 3600).toFixed(1)} hrs
                </div>
              )}
            </div>
            {routeError ? <p className="mt-2 text-xs text-red-400">{routeError}</p> : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111118] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">Community trail map</div>
              <div className="text-xs text-zinc-400">{locations.length} saved</div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <MapContainer center={defaultCenter} zoom={10} scrollWheelZoom className="h-[320px] w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsController startLocation={startLocation} destinationLocation={destinationLocation} route={route} />
                {route && route.coordinates.length > 0 && <Polyline positions={route.coordinates} pathOptions={{ color: "#ef4444", weight: 5 }} />}
                {startLocation ? (
                  <Marker position={[startLocation.lat, startLocation.lng]} icon={createRouteMarkerIcon("green", "🟢")}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold text-sm text-white">Start</div>
                        <div className="text-xs text-zinc-300">{startLocation.label}</div>
                      </div>
                    </Popup>
                  </Marker>
                ) : null}
                {destinationLocation ? (
                  <Marker position={[destinationLocation.lat, destinationLocation.lng]} icon={createRouteMarkerIcon("red", "🔴")}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold text-sm text-white">Destination</div>
                        <div className="text-xs text-zinc-300">{destinationLocation.label}</div>
                      </div>
                    </Popup>
                  </Marker>
                ) : null}
                {pendingLocation && (
                  <Marker position={[pendingLocation.lat, pendingLocation.lng]} icon={createMarkerIcon()}>
                    <Popup>
                      <div className="space-y-2">
                        <input
                          value={newLocationForm.name}
                          onChange={(event) => setNewLocationForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Location name"
                          className="w-full rounded-lg border border-white/10 bg-[#111118] px-2 py-1 text-xs text-white outline-none"
                        />
                        <textarea
                          value={newLocationForm.description}
                          onChange={(event) => setNewLocationForm((current) => ({ ...current, description: event.target.value }))}
                          placeholder="Description"
                          className="min-h-[60px] w-full rounded-lg border border-white/10 bg-[#111118] px-2 py-1 text-xs text-white outline-none"
                        />
                        <select
                          value={newLocationForm.type}
                          onChange={(event) => setNewLocationForm((current) => ({ ...current, type: event.target.value as CommunityLocation["location_type"] }))}
                          className="w-full rounded-lg border border-white/10 bg-[#111118] px-2 py-1 text-xs text-white outline-none"
                        >
                          <option value="start">Start</option>
                          <option value="checkpoint">Checkpoint</option>
                          <option value="campsite">Campsite</option>
                          <option value="water">Water</option>
                          <option value="viewpoint">Viewpoint</option>
                          <option value="danger">Danger</option>
                          <option value="destination">Destination</option>
                          <option value="other">Other</option>
                        </select>
                        <button type="button" onClick={handleSaveLocation} className="rounded-lg bg-red-500 px-2 py-1.5 text-[11px] font-semibold text-white">
                          Save location
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                )}
                <MapClickHandler
                  disabled={false}
                  onClick={(latlng) => {
                    if (selectionMode === "start") {
                      void setLocationFromMapSelection("start", latlng);
                      return;
                    }

                    if (selectionMode === "destination") {
                      void setLocationFromMapSelection("destination", latlng);
                      return;
                    }

                    setPendingLocation({ lat: latlng.lat, lng: latlng.lng });
                  }}
                />
                {locations.map((location) => (
                  <Marker key={location.id} position={[location.latitude, location.longitude]} icon={createMarkerIcon()}>
                    <Popup>
                      <div className="space-y-1">
                        <div className="font-semibold text-sm text-white">{location.name}</div>
                        {location.description ? <div className="text-xs text-zinc-300">{location.description}</div> : null}
                        <div className="text-[10px] uppercase tracking-[0.2em] text-red-300">{location.location_type}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>

            <div className="mt-3 text-xs text-zinc-400">
              Click anywhere on the map to add a saved trekking location. Use Start/Destination selection for route planning.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
