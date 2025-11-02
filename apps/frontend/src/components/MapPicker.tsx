import { useMemo } from "react";
import Map, { MapLayerMouseEvent, Marker, NavigationControl } from "react-map-gl";

interface MapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

export default function MapPicker({ latitude, longitude, onChange }: MapPickerProps) {
  if (!MAPBOX_TOKEN) {
    return (
      <div className="card" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
        <p style={{ margin: 0 }}>
          Mapbox token not configured. Township IT can set <code>VITE_MAPBOX_TOKEN</code> in <code>.env.local</code> to
          enable interactive mapping. For now, please enter the street address manually.
        </p>
      </div>
    );
  }

  const initialView = useMemo(
    () => ({
      latitude: latitude ?? 40.2995,
      longitude: longitude ?? -74.6197,
      zoom: 12
    }),
    [latitude, longitude]
  );

  function handleClick(event: MapLayerMouseEvent) {
    onChange(event.lngLat.lat, event.lngLat.lng);
  }

  return (
    <div style={{ height: "320px", borderRadius: "16px", overflow: "hidden" }}>
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialView}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: "100%", height: "100%" }}
        onClick={handleClick}
        reuseMaps
      >
        <NavigationControl position="bottom-right" />
        {latitude && longitude && (
          <Marker latitude={latitude} longitude={longitude} color="#0c6bd6" />
        )}
      </Map>
    </div>
  );
}
