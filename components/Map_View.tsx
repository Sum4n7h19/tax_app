"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  LayersControl,
  ScaleControl,
  useMap,
} from "react-leaflet";
import type { FeatureCollection } from "geojson";
import type { LatLngExpression, Layer, LatLngBounds } from "leaflet";
import MIT from "../public/MIT.jpg";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// NOTE: Make sure 'leaflet-measure' is installed via npm/yarn
import "leaflet-measure/dist/leaflet-measure.css";

// Destructure for cleaner use
const { BaseLayer, Overlay } = LayersControl;

// --- CONFIGURATION AND TYPES ---

const FILTER_FIELDS = ["Landuse", "BuiltType", "No_Floors", "CornerSite"] as const;
type FilterField = (typeof FILTER_FIELDS)[number] | "none";

const COLOR_MAPPING: Record<string, Record<string, string>> = {
  Landuse: {
    Builtup: "#ff0000",
    Vacant: "#BFA3A3",
  },
  BuiltType: {
    Vacant: "#BFA3A3",
    Commercial: "#000BFF",
    Mixed: "#66ff66",
    Residential: "#FFFF05",
    Gated_Community: "#FFB13B",
  },
  No_Floors: {
    G: "#F8FC00",
    "G+!": "#00FC08",
    "G+1": "#00FCE7",
    "G+2": "#002EFC",
    Vacant: "#BFA3A3",
  },
  CornerSite: {
    Yes: "#00FF08",
    No: "#999999",
  },
};

// --- LEAFLET MEASURE CONTROL COMPONENT ---

/**
 * 🧊 Max Bounds Lock Fix: Locks the map view to prevent any panning 
 * (manual or automated) during the measurement process.
 */
function MeasureControl() {
  const map = useMap();
  const controlRef = useRef<any>(null);
  // Variable to store the map bounds when measurement starts
  const boundsRef = useRef<LatLngBounds | null>(null);

  useEffect(() => {
    if (!map) return;

    let measureControl = controlRef.current;
    let disableInteractions = () => { };
    let enableInteractions = () => { };
    let isMounted = true;

    // dynamic import on client
    import("leaflet-measure").then(() => {
      if (!isMounted) return;

      if (controlRef.current) return;

      const Measure = (L as any).Control.Measure;
      if (!Measure) return;

      measureControl = new Measure({
        position: "topleft",
        primaryLengthUnit: "meters",
        secondaryLengthUnit: "kilometers",
        primaryAreaUnit: "sqmeters",
        secondaryAreaUnit: "hectares",
        activeColor: "#ABE67E",
        completedColor: "#C8F2BE",
        // Crucial setting to prevent automated centering
        autoPan: false,
        popupOptions: {
          className: "leaflet-measure-resultpopup",
          autoPan: false,
        },
      });

      controlRef.current = measureControl;
      measureControl.addTo(map);

      // 🔒 turn off map interactions and lock view
      disableInteractions = () => {
        // 1. Get the current map view
        boundsRef.current = map.getBounds();
        // 2. Lock the map bounds to the current view
        map.setMaxBounds(boundsRef.current);

        // Disable other controls for redundancy
        map.dragging.disable();
        map.scrollWheelZoom.disable();
        map.doubleClickZoom.disable();
        map.boxZoom.disable();
        // @ts-ignore
        map.touchZoom && map.touchZoom.disable();
        // @ts-ignore
        map.tap && map.tap.disable();
        map.keyboard.disable();
      };

      // 🔓 back to normal
      enableInteractions = () => {
        // 1. Remove the max bounds lock
        // map.setMaxBounds(null);

        // Re-enable all controls
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();
        map.boxZoom.enable();
        // @ts-ignore
        map.touchZoom && map.touchZoom.enable();
        // @ts-ignore
        map.tap && map.tap.enable();
        map.keyboard.enable();

        // Optional: Reset view to center if bounds were tight and caused issues
        // if (boundsRef.current) {
        //   map.fitBounds(boundsRef.current, { animate: false });
        //   boundsRef.current = null;
        // }
      };

      // Attach listeners to both map and control events
      map.on("measurestart", disableInteractions);
      map.on("measurefinish", enableInteractions);
      // @ts-ignore
      measureControl.on && measureControl.on("measurestart", disableInteractions);
      // @ts-ignore
      measureControl.on && measureControl.on("measurefinish", enableInteractions);
    });

    return () => {
      isMounted = false;

      // Clean up listeners
      map.off("measurestart");
      map.off("measurefinish");

      // Remove control and reset bounds on component unmount/cleanup
      if (controlRef.current) {
        map.removeControl(controlRef.current);
        controlRef.current = null;
      }
     // map.setMaxBounds(null); // Ensure lock is removed

      // Re-enable interactions just in case
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      // @ts-ignore
      map.touchZoom && map.touchZoom.enable();
      // @ts-ignore
      map.tap && map.tap.enable();
      map.keyboard.enable();
    };
  }, [map]);

  return null;
}

// --- MAIN MAP COMPONENT ---

export default function MapView() {
  const [propertyData, setPropertyData] = useState<FeatureCollection | null>(
    null
  );
  const [boundaryData, setBoundaryData] = useState<FeatureCollection | null>(
    null
  );
  const [roadData, setRoadData] = useState<FeatureCollection | null>(null);

  const [filterField, setFilterField] = useState<FilterField>("none");
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>(
    {}
  );

  // 📡 Data Fetching
  useEffect(() => {
    Promise.all([
      fetch("/data/Property.geojson"),
      fetch("/data/Boundary.geojson"),
      fetch("/data/Road.geojson"),
    ])
      .then(async ([p, b, r]) => {
        if (p.ok) {
          const propJson = (await p.json()) as FeatureCollection;
          setPropertyData(propJson);
          computeUniqueValues(propJson);
        }
        if (b.ok) setBoundaryData(await b.json());
        if (r.ok) setRoadData(await r.json());
      })
      .catch(console.error);
  }, []);

  const center: LatLngExpression = [12.2916, 76.5946];

  // 🧮 Compute Unique Values for Legend/Filter
  const computeUniqueValues = (fc: FeatureCollection) => {
    const result: Record<string, Set<string>> = {};
    FILTER_FIELDS.forEach((field) => {
      result[field] = new Set<string>();
    });

    for (const f of fc.features as any[]) {
      const props = f.properties as any;
      if (!props) continue;
      FILTER_FIELDS.forEach((field) => {
        const v = props[field];
        if (v !== null && v !== undefined && v !== "") {
          result[field].add(String(v));
        }
      });
    }

    const final: Record<string, string[]> = {};
    FILTER_FIELDS.forEach((field) => {
      final[field] = Array.from(result[field]).sort();
    });

    setUniqueValues(final);
  };

  // 📝 Popup Generator
  const buildPopupHTML = (feature: any) => {
    const props = feature?.properties || {};
    const keys = Object.keys(props);
    if (!keys.length) return "<b>No Attributes</b>";

    const idCandidates = ["Property_ID", "PropID", "ID", "PropertyID"];
    const idField = idCandidates.find((k) => k in props) ?? null;
    const idValue = idField ? props[idField] : null;

    // 🏷️ Read Landuse & CornerSite attributes from the feature
    const landuseValue = props["Landuse"] ?? "";
    const cornerValue = props["CornerSite"] ?? "";

    let html = "<div>";

    html += "<table style='border-collapse: collapse; min-width: 200px;'>";

    // Display ID field first if found
    if (idField) {
      html += `
        <tr>
          <td style='padding:4px;font-weight:bold;border-bottom:1px solid #ddd;'>${idField}</td>
          <td style='padding:4px;border-bottom:1px solid #ddd;'>${props[idField]}</td>
        </tr>
      `;
    }

    // Display all other properties
    for (const key of keys) {
      if (key === idField) continue;
      html += `
        <tr>
          <td style='padding:4px;font-weight:bold;border-bottom:1px solid #ddd;'>${key}</td>
          <td style='padding:4px;border-bottom:1px solid #ddd;'>${props[key]}</td>
        </tr>
      `;
    }

    html += "</table>";

    // 🔘 Add "Assess tax" button if we have a Property ID
    if (idValue !== null && idValue !== undefined && idValue !== "") {
      const params: string[] = [];

      params.push(`propertyId=${encodeURIComponent(String(idValue))}`);

      if (landuseValue !== null && landuseValue !== undefined && landuseValue !== "") {
        params.push(`landuse=${encodeURIComponent(String(landuseValue))}`);
      }

      if (cornerValue !== null && cornerValue !== undefined && cornerValue !== "") {
        params.push(`corner=${encodeURIComponent(String(cornerValue))}`);
      }

      const queryString = params.join("&");

      html += `
        <div style="margin-top:8px; text-align:right;">
          <button
            type="button"
            onclick="window.location.href='/assess-tax?${queryString}'"
            style="
              padding:6px 12px;
              border-radius:4px;
              border:1px solid #007bff;
              background:#007bff;
              color:#fff;
              cursor:pointer;
              font-size:12px;
            "
          >
            Assess tax
          </button>
        </div>
      `;
    }

    html += "</div>";
    return html;
  };

  // 📌 Popup Attachment for Properties
  const attachPropertyPopup = (feature: any, layer: Layer) => {
    const popupHtml = buildPopupHTML(feature);
    const lyr = layer as any;

    lyr.bindPopup(popupHtml);

    // Make sure clicking always opens the popup
    lyr.on("click", () => {
      lyr.openPopup();
    });
  };

  // 📌 Popup Attachment for Roads (with click to open)
  const attachRoadPopup = (feature: any, layer: Layer) => {
    const popupHtml = buildPopupHTML(feature);
    const lyr = layer as any;
    lyr.bindPopup(popupHtml);
    lyr.on("click", () => lyr.openPopup());
  };

  const currentValues =
    filterField !== "none" && uniqueValues[filterField]
      ? uniqueValues[filterField]
      : [];

  const borderColor = "#454441";

  // 🎨 Property Styling Function
  const propertyStyle = (feature: any) => {
    const props = feature.properties || {};

    if (filterField === "none") {
      return {
        color: borderColor,
        weight: 1,
        fillColor: "#ffff00",
        fillOpacity: 0.7,
      };
    }

    const rawValue = props[filterField];
    const valueKey =
      rawValue !== null && rawValue !== undefined ? String(rawValue) : "";
    const fillColor = COLOR_MAPPING[filterField]?.[valueKey] || "#cccccc";

    return {
      color: borderColor,
      weight: 1,
      fillColor,
      fillOpacity: 0.8,
    };
  };

  // 🌐 Base Map Tile Configuration
  // 🌐 Base Map Tile Configuration (Max zoom safe)
  const baseLayersConfig = {
    streets: {
      name: "Streets (OSM)",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      maxNativeZoom: 19, // OSM native zoom
      maxZoom: 25,       // Allow zoom-in without disappearing
    },

    satellite: {
      name: "Satellite",
      url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attribution:
        "© Google Satellite",
      maxNativeZoom: 21, // Google native zoom
      maxZoom: 25,
    },

    topo: {
      name: "Topographic",
      url: "https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      attribution:
        "Tiles © Esri",
      maxNativeZoom: 19, // Esri topo native zoom
      maxZoom: 25,
    },
  } as const;


  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      {/* LEFT PANEL (Controls) */}
      <div
        style={{
          width: "320px",
          padding: "16px",
          background: "#fff",
          borderRight: "1px solid #ccc",
          color: "black",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >

        <h2 style={{ fontSize: "20px", fontWeight: "bold", color: "black", alignItems: "center", textAlign: "center" }}>
          Property Tax Calculator
        </h2>

        {/* Filter dropdown */}
        <div style={{ marginTop: "16px" }}>
          <label
            style={{
              fontWeight: "bold",
              display: "block",
              marginBottom: "4px",
              textAlign: "center",
            }}
          >
            Filter Property By
          </label>
          <select
            value={filterField}
            onChange={(e) => {
              const field = e.target.value as FilterField;
              setFilterField(field);
            }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #8888",
              cursor: "pointer",
              backgroundColor: "#f9f9f9",
            }}
          >
            <option value="none">No Filter</option>
            <option value="Landuse">Landuse</option>
            <option value="BuiltType">Built Type</option>
            <option value="No_Floors">No Floors</option>
            <option value="CornerSite">Corner Site</option>
          </select>
        </div>
        <img src="/MIT.jpg" alt="logo" style={{ width: "60%", height: "auto", marginLeft: "20%", marginTop: "50px" }} />
        <h1 style={{ fontSize: "24px", fontWeight: "bold", color: "black", alignItems: "center", textAlign: "center" }}>Maharaja Institute of Technology</h1>
        <h2 style={{ fontSize: "20px", fontWeight: "bold", color: "black", alignItems: "center", textAlign: "center" }}>Mysore</h2>
      </div>


      {/* --- MAP + LEGEND WRAPPER --- */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer
          center={center}
          zoom={14}
          maxZoom={25}
          preferCanvas
          style={{ height: "100%", width: "100%" }}
        >

          {/* Controls */}
          <ScaleControl position="bottomleft" />
          <MeasureControl />

          <LayersControl position="topright">
            {/* BASE LAYERS */}
            <BaseLayer checked name={baseLayersConfig.streets.name}>
              <TileLayer
                url={baseLayersConfig.streets.url}
                attribution={baseLayersConfig.streets.attribution}
                maxNativeZoom={baseLayersConfig.streets.maxNativeZoom}
                maxZoom={baseLayersConfig.streets.maxZoom}
              />

            </BaseLayer>

            <BaseLayer name={baseLayersConfig.satellite.name}>
              <TileLayer
                url={baseLayersConfig.satellite.url}
                attribution={baseLayersConfig.satellite.attribution}
                maxNativeZoom={baseLayersConfig.satellite.maxNativeZoom}
                maxZoom={baseLayersConfig.satellite.maxZoom}
              />

            </BaseLayer>

            <BaseLayer name={baseLayersConfig.topo.name}>
              <TileLayer
                url={baseLayersConfig.topo.url}
                attribution={baseLayersConfig.topo.attribution}
                maxNativeZoom={baseLayersConfig.topo.maxNativeZoom}
                maxZoom={baseLayersConfig.topo.maxZoom}
              />

            </BaseLayer>

            {/* OVERLAYS */}
            {boundaryData && (
              <Overlay checked name="Boundary">
                <GeoJSON
                  data={boundaryData}
                  style={{
                    color: "red",
                    weight: 3,
                    dashArray: "6 5",
                    fillOpacity: 0,
                  }}
                />
              </Overlay>
            )}

            {propertyData && (
              <Overlay checked name="Properties">
                <GeoJSON
                  key={filterField}
                  data={propertyData as any}
                  style={propertyStyle}
                  onEachFeature={attachPropertyPopup}
                />
              </Overlay>
            )}

            {roadData && (
              <Overlay checked name="Roads">
                <GeoJSON
                  data={roadData as any}
                  style={{ color: "blue", weight: 2 }}
                  onEachFeature={attachRoadPopup}
                />
              </Overlay>
            )}
          </LayersControl>
        </MapContainer>

        {/* LEGEND */}
        {filterField !== "none" && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              background: "rgba(255,255,255,0.95)",
              padding: "12px 14px",
              borderRadius: "8px",
              boxShadow: "0 0 6px rgba(0,0,0,0.3)",
              maxHeight: "40vh",
              overflowY: "auto",
              fontSize: "13px",
              color: "black",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color: "black",
                borderBottom: "1px solid #eee",
                paddingBottom: "4px",
              }}
            >
              Legend: {filterField}
            </div>

            {currentValues.length === 0 && (
              <div style={{ color: "black" }}>No values found</div>
            )}

            {currentValues.map((val) => {
              const color = COLOR_MAPPING[filterField]?.[val] || "#cccccc";
              return (
                <div
                  key={val}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "6px",
                    color: "black",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "16px",
                      height: "16px",
                      marginRight: "8px",
                      borderRadius: "3px",
                      border: "1px solid #333",
                      backgroundColor: color,
                    }}
                  />
                  <span>{val === "" ? "N/A or Unknown" : val}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}