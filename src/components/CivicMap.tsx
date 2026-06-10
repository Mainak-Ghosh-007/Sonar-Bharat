import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { Report } from "../types";

interface CivicMapProps {
  latitude: number;
  longitude: number;
  interactive?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  reports?: Report[];
  selectedReportId?: string | null;
  onSelectReportId?: (id: string) => void;
}

export default function CivicMap({
  latitude,
  longitude,
  interactive = true,
  onLocationSelect,
  reports = [],
  selectedReportId = null,
  onSelectReportId,
}: CivicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const communityMarkersRef = useRef<{ [id: string]: any }>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Inject Leaflet library assets dynamically from unpkg to avoid compile-time issues
  useEffect(() => {
    let scriptMounted = true;
    
    const loadLeafletAssets = async () => {
      // 1. Inject CSS if not already present
      if (!document.getElementById("leaflet-cdn-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-cdn-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      // 2. Inject JS if not already present on window
      if ((window as any).L) {
        if (scriptMounted) setIsLoaded(true);
        return;
      }

      if (!document.getElementById("leaflet-cdn-js")) {
        const script = document.createElement("script");
        script.id = "leaflet-cdn-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;
        script.onload = () => {
          if (scriptMounted) setIsLoaded(true);
        };
        script.onerror = () => {
          if (scriptMounted) setLoadError(true);
        };
        document.body.appendChild(script);
      } else {
        // Script Tag exists, wait and verify L
        const checkInterval = setInterval(() => {
          if ((window as any).L) {
            clearInterval(checkInterval);
            if (scriptMounted) setIsLoaded(true);
          }
        }, 100);
        setTimeout(() => clearInterval(checkInterval), 5000);
      }
    };

    loadLeafletAssets();

    return () => {
      scriptMounted = false;
    };
  }, []);

  // Main Map constructor and updating
  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;
    const LeafletObj = (window as any).L;
    if (!LeafletObj) return;

    // Reset container contents
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      // Instantiate Map
      const map = LeafletObj.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([latitude, longitude], 14);

      mapInstanceRef.current = map;

      // Add elegant map tile imagery (CartoDB Positron - clean and modern style)
      LeafletObj.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }
      ).addTo(map);

      // Create Custom pin SVGs
      const pinIcon = LeafletObj.divIcon({
        className: "custom-leaflet-pin",
        html: `<div class="bg-indigo-600 p-2 rounded-full border-2 border-white shadow-lg text-white block transform -translate-x-1/2 -translate-y-1/2 transition-all scale-110">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.74a1.88 1.88 0 0 1-2.4 0C8.32 20.193 3.001 14.99 3 10a8.002 8.002 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
               </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      // Pin location
      const pinMarker = LeafletObj.marker([latitude, longitude], {
        icon: pinIcon,
        draggable: interactive,
      }).addTo(map);

      markerInstanceRef.current = pinMarker;

      if (interactive && onLocationSelect) {
        // Drag end pin location update
        pinMarker.on("dragend", (e: any) => {
          const newPos = e.target.getLatLng();
          onLocationSelect(newPos.lat, newPos.lng);
        });

        // Click map location update
        map.on("click", (e: any) => {
          const newPos = e.latlng;
          pinMarker.setLatLng(newPos);
          onLocationSelect(newPos.lat, newPos.lng);
          map.panTo(newPos);
        });
      }

      // Add community points
      const markers: { [id: string]: any } = {};
      reports.forEach((rep) => {
        const isCurrent = rep.id === selectedReportId;
        const catColor = getCategoryColorClass(rep.category);
        
        const dotIcon = LeafletObj.divIcon({
          className: `custom-community-dot-${rep.id}`,
          html: `<div class="p-1 px-1.5 rounded-full border-2 ${isCurrent ? 'bg-rose-500 scale-125 ring-4 ring-rose-200' : `${catColor} opacity-90`} text-[10px] font-bold text-white shadow-md transition-all">
                  ${getCategoryIconText(rep.category)}
                 </div>`,
          iconSize: [32, 24],
          iconAnchor: [16, 12],
        });

        const m = LeafletObj.marker([rep.latitude, rep.longitude], {
          icon: dotIcon,
        }).addTo(map);

        // Bind quick popup
        m.bindTooltip(`<b>${rep.title}</b><br/>${rep.category} (${rep.status})`, {
          direction: "top",
          offset: [0, -10],
        });

        if (onSelectReportId) {
          m.on("click", () => {
            onSelectReportId(rep.id);
          });
        }

        markers[rep.id] = m;
      });

      communityMarkersRef.current = markers;

      // Handle map resizing
      const observer = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
      };
    } catch (e) {
      console.error("Leaflet instantiation error:", e);
    }
  }, [isLoaded, reports, interactive]);

  // Handle outside coordinates changes (syncing pin and panning map)
  useEffect(() => {
    if (mapInstanceRef.current && markerInstanceRef.current && isLoaded) {
      const LeafletObj = (window as any).L;
      if (!LeafletObj) return;

      const currentLatLng = markerInstanceRef.current.getLatLng();
      if (currentLatLng.lat !== latitude || currentLatLng.lng !== longitude) {
        markerInstanceRef.current.setLatLng([latitude, longitude]);
        mapInstanceRef.current.setView([latitude, longitude], 14);
      }
    }
  }, [latitude, longitude, isLoaded]);

  // Zoom into specific report point if changed
  useEffect(() => {
    if (selectedReportId && reports.length && mapInstanceRef.current) {
      const targetReport = reports.find((r) => r.id === selectedReportId);
      if (targetReport) {
        mapInstanceRef.current.setView([targetReport.latitude, targetReport.longitude], 16);
      }
    }
  }, [selectedReportId, reports]);

  // Helper colors for categories
  const getCategoryColorClass = (category: string) => {
    switch (category) {
      case "Potholes": return "bg-amber-600";
      case "Broken Roads": return "bg-orange-600";
      case "Water Logging": return "bg-blue-600";
      case "Garbage Dump": return "bg-emerald-700";
      case "Damaged Traffic Signal": return "bg-red-600";
      case "Street Light Not Working": return "bg-yellow-600";
      case "Drain Blockage": return "bg-purple-600";
      case "Fallen Trees": return "bg-teal-600";
      default: return "bg-slate-600";
    }
  };

  const getCategoryIconText = (category: string) => {
    switch (category) {
      case "Potholes": return "🛣️";
      case "Broken Roads": return "🚧";
      case "Water Logging": return "🌊";
      case "Garbage Dump": return "🗑️";
      case "Damaged Traffic Signal": return "🚦";
      case "Street Light Not Working": return "💡";
      case "Drain Blockage": return "🚱";
      case "Fallen Trees": return "🌳";
      default: return "🚨";
    }
  };

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner border border-gray-100 bg-gray-50 flex items-center justify-center">
      {!isLoaded && !loadError && (
        <div id="map-loader" className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"></div>
          <p className="text-xs font-medium text-gray-500 font-sans">Booting civic satellite map...</p>
        </div>
      )}

      {loadError && (
        <div className="text-center p-6 bg-red-50 text-red-600 font-sans flex flex-col items-center">
          <MapPin className="stroke-[1.5] w-8 h-8 mb-2 animate-bounce" />
          <h4 className="text-sm font-semibold">Map Load Interrupted</h4>
          <p className="text-xs mt-1 text-gray-500 max-w-xs">Connecting using static safety fallback.</p>
        </div>
      )}

      {/* Actual Map Node */}
      <div id="map-canvas" ref={containerRef} className="absolute inset-0 w-full h-full" style={{ opacity: isLoaded ? 1 : 0 }} />

      {/* Floating coordinates indicator */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-mono text-gray-500 border border-gray-100 flex items-center gap-2 shadow-md">
        <Navigation className="w-3.5 h-3.5 text-indigo-500 fill-indigo-100" />
        {latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E
      </div>
    </div>
  );
}
