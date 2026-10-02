import type { MapCameraState } from "./mapTypes";

const KEY = "keyora:map-view:v1";

export type MapViewSession = {
  mode: "satellite" | "3d";
  camera: MapCameraState;
};

export function readMapViewSession(): MapViewSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as MapViewSession | null;
    if (!value || (value.mode !== "satellite" && value.mode !== "3d")) return null;
    const camera = value.camera;
    if (
      !camera || !Number.isFinite(camera.lat) || Math.abs(camera.lat) > 90 ||
      !Number.isFinite(camera.lng) || Math.abs(camera.lng) > 180 ||
      !Number.isFinite(camera.zoom) || camera.zoom < 0 || camera.zoom > 24 ||
      (camera.height != null && (!Number.isFinite(camera.height) || camera.height <= 0)) ||
      (camera.heading != null && !Number.isFinite(camera.heading)) ||
      (camera.pitch != null && !Number.isFinite(camera.pitch))
    ) return null;
    return { mode: value.mode, camera };
  } catch {
    return null;
  }
}

export function saveMapViewSession(value: MapViewSession): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private browsing or storage restrictions must not stop the map.
  }
}
