import { useEffect, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { MapCameraState } from "@/components/map/mapTypes";

export type PoiCategory = "hospitals" | "schools" | "tourism";
export type PoiPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  images: string[];
  created_at: string;
  category: PoiCategory; // which table it came from — drives marker colour/glyph
  icon?: string | null; // optional per-place glyph override (see poiIcons.iconFor)
};

// Table names deliberately equal the category ids, and all three POI tables
// share an identical shape — so narrowing `table` to the POI-only union (not
// `keyof Tables`) lets supabase.from(table) type both inserts and selects
// against the real POI columns instead of the whole-schema union.
type PoiTable = Extract<keyof Database["public"]["Tables"], PoiCategory>;

export const POI_TABLES: Record<
  PoiCategory,
  {
    table: PoiTable;
    label: string;
    icon: string;
    color: string;
  }
> = {
  hospitals: {
    table: "hospitals",
    label: "Hospitals",
    icon: "✚", // white medical cross on the red button badge
    color: "#ef4444",
  },
  schools: {
    table: "schools",
    label: "Schools",
    icon: "🎓",
    color: "#3b82f6",
  },
  tourism: {
    table: "tourism",
    label: "Tourism",
    icon: "🏝️",
    color: "#f59e0b",
  },
};

// Use a padded viewport; the rounded key allows nearby pans to share a cached
// query. Bounding rows and limiting each category protects the map at scale.
function poiBounds(camera: MapCameraState) {
  const zoom = Math.max(0, camera.zoom);
  const width = typeof window === "undefined" ? 1200 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  const latSpan = Math.min(12, (height / (512 * 2 ** zoom)) * 360 * 1.25 * Math.cos(camera.lat * Math.PI / 180));
  const lngSpan = Math.min(20, (width / (512 * 2 ** zoom)) * 360 * 1.25);
  const round = (value: number) => Math.round(value * 20) / 20;
  return {
    south: Math.max(-85, round(camera.lat - latSpan)),
    north: Math.min(85, round(camera.lat + latSpan)),
    west: Math.max(-180, round(camera.lng - lngSpan)),
    east: Math.min(180, round(camera.lng + lngSpan)),
  };
}

export function usePois(categories: Set<PoiCategory>, camera: MapCameraState) {
  const [settledCamera, setSettledCamera] = useState(camera);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettledCamera({ lat: camera.lat, lng: camera.lng, zoom: camera.zoom }), 350);
    return () => window.clearTimeout(timeout);
  }, [camera.lat, camera.lng, camera.zoom]);
  const list = [...categories].sort();
  const bounds = poiBounds(settledCamera);
  return useQuery({
    queryKey: ["pois", list, bounds],
    queryFn: async (): Promise<PoiPoint[]> => {
      if (list.length === 0) return [];
      const results = await Promise.all(
        list.map(async (category) => {
          const { data, error } = await supabase.from(POI_TABLES[category].table)
            .select("id,name,lat,lng,images,created_at")
            .gte("lat", bounds.south).lte("lat", bounds.north)
            .gte("lng", bounds.west).lte("lng", bounds.east)
            .order("id").limit(200);
          if (error) throw error;
          return (data ?? []).map((row) => ({ ...row, category }) as PoiPoint);
        }),
      );
      return results.flat();
    },
    // Keep the already-shown markers on screen while the new union refetches, so
    // turning a second/third category ON never flashes the others off — this is
    // what made it look like they "don't work together".
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: list.length > 0 && settledCamera.zoom >= 8,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}

export function usePoiRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const channels = Object.entries(POI_TABLES).map(([_, { table }]) => {
      const channel = supabase
        .channel(`poi-${table}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: table as string,
          },
          () => {
            qc.invalidateQueries({
              queryKey: ["pois"],
            });
          }
        )
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((ch) => {
        supabase.removeChannel(ch);
      });
    };
  }, [qc, enabled]);
}
