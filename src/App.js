// src/App.js
import React, { useEffect, useRef, useState } from 'react';
import { generateClient } from '@aws-amplify/api';
// import awsExports from './aws-exports';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

console.log("MAPBOX_TOKEN from env:", process.env.REACT_APP_MAPBOX_TOKEN);

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const LIST_INCIDENTS = /* GraphQL */ `query ListIncidents { listIncidents { items { incidentId location latitude longitude summary severity timestamp } nextToken } }`;
const ON_NEW_INCIDENT = /* GraphQL */ `subscription OnNewIncident { onNewIncident { incidentId location latitude longitude summary severity timestamp } }`;
const LIST_ROUTES = /* GraphQL */ `query ListRoutes { listRoutes { items { assetId type nodes } } }`;

/********** Helpers **********/
function normalizeIncident(i) {
  if (!i) return null;
  return {
    incidentId: i.incidentId,
    location: i.location ?? 'Unknown',
    latitude: typeof i.latitude === 'number' ? i.latitude : Number(i.latitude ?? 0),
    longitude: typeof i.longitude === 'number' ? i.longitude : Number(i.longitude ?? 0),
    summary: i.summary ?? '',
    severity: i.severity ?? '',
    timestamp: i.timestamp ?? null
  };
}

function severityColor(sev) {
  if (!sev) return '#888';
  const s = ('' + sev).toLowerCase();
  if (s.includes('high')) return '#d32f2f';
  if (s.includes('medium')) return '#f9a825';
  if (s.includes('low')) return '#1976d2';
  return '#666';
}

/********** Geocode cache (localStorage-backed) **********/
const geocodeCache = new Map();
try {
  const raw = localStorage.getItem('geocodeCache_v1');
  if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => geocodeCache.set(k, v));
} catch (e) { /* ignore */ }
function persistGeocodeCache() {
  try { localStorage.setItem('geocodeCache_v1', JSON.stringify(Object.fromEntries(geocodeCache))); } catch (e) {}
}
window.addEventListener('beforeunload', persistGeocodeCache);
async function geocodeNode(node) {
  if (!node) return null;
  const s = String(node).trim();
  const parts = s.split(',').map(p => p.trim());
  if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
    const a = Number(parts[0]), b = Number(parts[1]);
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
    return [a, b];
  }
  if (geocodeCache.has(s)) return geocodeCache.get(s);
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(s)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) { geocodeCache.set(s, null); return null; }
    const body = await res.json();
    const feat = body.features && body.features[0];
    if (feat && Array.isArray(feat.center) && feat.center.length === 2) {
      const entry = { center: feat.center, label: feat.place_name || feat.text || s };
      geocodeCache.set(s, entry);
      return entry;
    }
  } catch (e) { console.warn('geocode error', e, s); }
  geocodeCache.set(s, null);
  return null;
}

/********** UI Components **********/
const NewIncidentNotification = ({ incident, onClick }) => {
    if (!incident) return null;
    return (
        <div 
          onClick={onClick}
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 10000, background: 'rgba(255, 255, 255, 0.98)', color: '#111', borderRadius: 8, padding: '12px 16px', boxShadow: '0 6px 20px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 350,
          }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: severityColor(incident.severity), border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', animation: 'pulse-red 1.5s infinite', flexShrink: 0 }}></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>New Incident Reported</div>
            <div style={{ marginTop: 4, fontSize: 13, color: '#333' }}><strong>{incident.location}</strong>: {incident.summary}</div>
          </div>
        </div>
    );
};

const IncidentCounter = ({ count, onClick }) => {
    return (
        <div 
            onClick={onClick}
            style={{
                position: 'absolute', left: 16, top: 16, zIndex: 1001, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.7)'}
        >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d32f2f', animation: 'pulse-red 1.5s infinite' }}></div>
            <span>{count} Live Incidents</span>
        </div>
    );
};

const IncidentList = ({ incidents, onIncidentSelect }) => {
    return (
        <div style={{
            position: 'absolute', left: 16, top: 56, zIndex: 1000, background: 'rgba(255,255,255,0.98)', color: '#111', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', width: 320, maxHeight: '40vh', overflowY: 'auto'
        }}>
            {incidents.length === 0 ? (
                <div style={{ padding: '16px', color: '#666' }}>No active incidents.</div>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
                    {incidents.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).map(inc => (
                        <li 
                            key={inc.incidentId}
                            onClick={() => onIncidentSelect(inc)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid #eee', cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: severityColor(inc.severity), flexShrink: 0 }}></div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{inc.location}</div>
                                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{inc.summary}</div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};


// NEW: 1. Create a component for the reset view button
const ResetViewButton = ({ onClick }) => {
  return (
      <button
          onClick={onClick}
          title="Reset View"
          style={{
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 1001,
              width: 36,
              height: 36,
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid #ddd',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              padding: 0,
          }}
      >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
      </button>
  );
};


const CHAT_API_ENDPOINT = process.env.REACT_APP_CHAT_API_ENDPOINT;
const NEWS_SCANNER_ENDPOINT = process.env.REACT_APP_NEWS_SCANNER_ENDPOINT;


// Replace your existing ChatWindow component with this one
const ChatWindow = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const chatSessionId = useRef(crypto.randomUUID());
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleScanNews = async () => {
        setIsScanning(true);
        setMessages(prev => [...prev, { sender: 'system', text: 'Requesting news scan... This may take up to 20 seconds.' }]);

        try {
            const res = await fetch(NEWS_SCANNER_ENDPOINT, { method: 'POST' });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            
            // CORRECTED LOGIC: res.json() fully parses the response.
            // The result is an object like { logs: "..." }
            const data = await res.json();
            
            // Use the 'logs' property directly. No second parse needed.
            setMessages(prev => [...prev, { sender: 'system', text: data.logs }]);

        } catch (error) {
            console.error("News Scan API error:", error);
            if (error instanceof SyntaxError) {
                 setMessages(prev => [...prev, { sender: 'system', text: `An error occurred: The response from the server was not valid JSON. This can happen if the scan timed out.` }]);
            } else {
                 setMessages(prev => [...prev, { sender: 'system', text: `An error occurred during the news scan: ${error.message}` }]);
            }
        } finally {
            setIsScanning(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const userMessage = inputValue.trim();
        if (!userMessage || isLoading || isScanning) return;

        setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
        setInputValue('');
        setIsLoading(true);

        try {
            const res = await fetch(CHAT_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMessage, sessionId: chatSessionId.current })
            });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            
            const data = await res.json();
            setMessages(prev => [...prev, { sender: 'agent', text: data.response }]);
        } catch (error) {
            console.error("Chat API error:", error);
            setMessages(prev => [...prev, { sender: 'agent', text: "Sorry, I encountered an error. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {isOpen && (
                <div style={{ position: 'absolute', bottom: 100, right: 20, zIndex: 1100, width: 380, height: 500, background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
                    {/* Header with new button */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', background: '#f7f7f7', borderTopLeftRadius: 12, borderTopRightRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>Atlas Agent</div>
                        <button onClick={handleScanNews} disabled={isScanning || isLoading} title="Scan for breaking news" style={{ background: isScanning ? '#ccc' : '#eee', border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px', cursor: isScanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                            Scan News
                        </button>
                    </div>
                    
                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 12, fontSize: 14 }}>
                        {messages.map((msg, index) => (
                            <div key={index} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{ 
                                    background: msg.sender === 'user' ? '#0078D4' : (msg.sender === 'agent' ? '#f0f0f0' : '#fff8e1'),
                                    color: msg.sender === 'user' ? '#fff' : '#222',
                                    padding: '8px 12px', borderRadius: 16, maxWidth: '90%', 
                                    border: msg.sender === 'system' ? '1px solid #ffecb3' : 'none'
                                }}>
                                    {msg.sender === 'system' ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>{msg.text}</pre> : msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'left' }}>Atlas is thinking...</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Form */}
                    <form onSubmit={handleSubmit} style={{ borderTop: '1px solid #eee', padding: 10, display: 'flex' }}>
                        <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="Ask about an event..." style={{ flex: 1, border: '1px solid #ddd', borderRadius: 20, padding: '8px 12px', marginRight: 8, outline: 'none' }} disabled={isScanning} />
                        <button type="submit" disabled={isLoading || isScanning} style={{ background: '#0078D4', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }}>➔</button>
                    </form>
                </div>
            )}

            {/* The Chat Bubble Toggle Button */}
            <button onClick={() => setIsOpen(prev => !prev)} title="Chat with Atlas" style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1100, width: 60, height: 60, borderRadius: '50%', background: '#0078D4', color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
        </>
    );
};




/********** App component **********/
export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const clientRef = useRef(null);
  const subRef = useRef(null);
  const pollRef = useRef(null);
  const markersRef = useRef(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [newIncidentAlert, setNewIncidentAlert] = useState(null);
  const [isIncidentListOpen, setIsIncidentListOpen] = useState(false);

  /********** Initialize Map (always render container) **********/
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapRef.current = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12', projection: 'globe', center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0, antialias: true });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-left');
    const onLoad = () => {
      try { const canvas = mapRef.current.getCanvas(); if (canvas) { canvas.style.display = 'block'; canvas.style.visibility = 'visible'; canvas.style.opacity = '1'; } mapRef.current.resize(); } catch (e) { console.warn('canvas patch failed', e); }
      try { if (!mapRef.current.getSource('routes')) { mapRef.current.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }}); mapRef.current.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#00BCD4', 'line-width': 2, 'line-opacity': 0.6 } }); mapRef.current.addLayer({ id: 'routes-line-highlight', type: 'line', source: 'routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffd700', 'line-width': 4, 'line-opacity': 0.95 }, filter: ['==', ['get', 'assetId'], ''] }); } } catch (e) { console.warn('routes init failed', e); }
      try { if (!mapRef.current.getSource('mapbox-dem')) { mapRef.current.addSource('mapbox-dem', { type:'raster-dem', url:'mapbox://mapbox.terrain-rgb', tileSize:512, maxzoom:14 }); mapRef.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 }); } const layers = mapRef.current.getStyle().layers || []; let labelLayerId = null; for (let i=0;i<layers.length;i++){ if (layers[i].type==='symbol'&&layers[i].layout&&layers[i].layout['text-field']){ labelLayerId=layers[i].id; break; } } if (!mapRef.current.getLayer('add-3d-buildings')) { mapRef.current.addLayer({ id:'add-3d-buildings', source:'composite', 'source-layer':'building', filter:['==','extrude','true'], type:'fill-extrusion', minzoom:12, paint:{ 'fill-extrusion-color':'#aaa', 'fill-extrusion-height':['interpolate',['linear'],['zoom'],12,0,15,['get','height']], 'fill-extrusion-base':['interpolate',['linear'],['zoom'],12,0,15,['get','min_height']], 'fill-extrusion-opacity':0.9 } }, labelLayerId); } } catch (e) { console.warn('3D add failed', e); }
      if (!mapRef.current._routesHandlersAttached) { mapRef.current.on('mouseenter', 'routes-line', () => { mapRef.current.getCanvas().style.cursor = 'pointer'; }); mapRef.current.on('mouseleave', 'routes-line', () => { mapRef.current.getCanvas().style.cursor = ''; }); mapRef.current._routesHandlersAttached = true; }
      setMapReady(true);
    };
    mapRef.current.once('load', onLoad);
    mapRef.current.on('error', (e) => console.error('map error', e));
    return () => { try { mapRef.current && mapRef.current.remove(); } catch (e) {} mapRef.current = null; setMapReady(false); };
  }, []);

  /********** Incidents: initial fetch + polling fallback **********/
  async function fetchIncidentsOnce() {
    try {
      if (!clientRef.current) clientRef.current = generateClient();
      const res = await clientRef.current.graphql({ query: LIST_INCIDENTS });
      if (res.errors) console.error('listIncidents GraphQL errors', res.errors);
      const items = res?.data?.listIncidents?.items || [];
      return items.map(normalizeIncident).filter(Boolean);
    } catch (e) { console.error('fetchIncidentsOnce error', e); return []; }
  }
    function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try { const items = await fetchIncidentsOnce(); applyIncidents(items); } catch (e) { console.error('polling fetch failed', e); }
    }, 10000);
    console.log('Polling started as fallback');
  }
  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; console.log('Polling stopped'); } }
  function applyIncidents(list) { if (!Array.isArray(list)) return; setIncidents(list); updateMarkers(list); }
  function updateMarkers(list) {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const ids = new Set(list.map(i => i.incidentId));
    for (const [id, meta] of markersRef.current.entries()) { if (!ids.has(id)) { try { meta.marker.remove(); if (meta.popup) meta.popup.remove(); } catch (e) {} markersRef.current.delete(id); } }
    for (const inc of list) {
      if (!inc) continue;
      const lat = inc.latitude, lon = inc.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const existing = markersRef.current.get(inc.incidentId);
      const color = severityColor(inc.severity);
      if (existing) {
        try { existing.marker.setLngLat([lon, lat]); if (existing.popup) existing.popup.setHTML(`<div style="font-weight:700">${inc.location}</div><div style="margin-top:6px">${inc.summary}</div>`); } catch (e) {}
        continue;
      }
      const el = document.createElement('div');
      Object.assign(el.style, { width:'14px', height:'14px', borderRadius:'14px', background:color, border:'2px solid white', boxShadow:'0 1px 4px rgba(0,0,0,0.4)', cursor:'pointer' });
      const popup = new mapboxgl.Popup({ offset:12, closeOnClick:true }).setHTML(`<div style="font-weight:700">${inc.location}</div><div style="margin-top:6px">${inc.summary}</div>`);
      const marker = new mapboxgl.Marker({ element:el, anchor:'center' }).setLngLat([lon, lat]).addTo(map);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const m of markersRef.current.values()) { try { m.popup.remove(); } catch (err) {} }
        popup.addTo(map).setLngLat([lon, lat]);
        try { map.easeTo({ center: [lon, lat], zoom: 16, pitch: 60, bearing: 0, duration: 1200 }); } catch (err) {}
      });
      markersRef.current.set(inc.incidentId, { marker, popup });
    }
    console.log('Markers synced, total=', markersRef.current.size);
  }

  /********** Routes: fetch, geocode, draw (store node labels) **********/
  async function fetchAndDrawRoutes() {
    if (!mapRef.current) return;
    try {
      if (!clientRef.current) clientRef.current = generateClient();
      const res = await clientRef.current.graphql({ query: LIST_ROUTES });
      const items = res?.data?.listRoutes?.items || [];
      const features = [];
      for (const r of items) {
        if (!r || !Array.isArray(r.nodes) || r.nodes.length < 2) continue;
        const coords = []; const labels = [];
        for (const node of r.nodes) {
          const ge = await geocodeNode(node);
          if (ge && ge.center) { coords.push(ge.center); labels.push({ original: node, label: ge.label || node }); }
          else if (ge === null) { labels.push({ original: node, label: node }); }
          else { if (Array.isArray(ge) && ge.length === 2) { coords.push(ge); labels.push({ original: node, label: node }); } else { labels.push({ original: node, label: node }); } }
        }
        if (coords.length >= 2) { features.push({ type: 'Feature', properties: { assetId: r.assetId, type: r.type || 'route', nodeCount: r.nodes.length, nodeLabels: labels }, geometry: { type: 'LineString', coordinates: coords } }); }
      }
      const geojson = { type: 'FeatureCollection', features };
      const src = mapRef.current.getSource('routes');
      if (src) src.setData(geojson); else mapRef.current.addSource('routes', { type: 'geojson', data: geojson });
      if (!mapRef.current._routesClickAttached) {
        mapRef.current.on('click', 'routes-line', (e) => {
          const features = mapRef.current.queryRenderedFeatures(e.point, { layers: ['routes-line'] });
          if (!features || !features.length) return;
          const f = features[0]; const props = f.properties || {}; const assetId = props.assetId;
          mapRef.current.setFilter('routes-line-highlight', ['==', ['get', 'assetId'], assetId]);
          const coords = f.geometry.coordinates; const lats = coords.map(c => c[1]); const lons = coords.map(c => c[0]);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats); const minLon = Math.min(...lons), maxLon = Math.max(...lons);
          mapRef.current.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, duration: 1000 });
          let nodeLabels = []; if (props.nodeLabels) { try { nodeLabels = typeof props.nodeLabels === 'string' ? JSON.parse(props.nodeLabels) : props.nodeLabels; } catch (err) { nodeLabels = props.nodeLabels; } }
          const startLabel = (nodeLabels[0] && nodeLabels[0].label) || (nodeLabels[0] && nodeLabels[0].original) || null;
          const endLabel = (nodeLabels[nodeLabels.length - 1] && nodeLabels[nodeLabels.length - 1].label) || (nodeLabels[nodeLabels.length - 1] && nodeLabels[nodeLabels.length - 1].original) || null;
          setSelectedRoute({ assetId, type: props.type || 'route', nodeCount: props.nodeCount || (coords.length || 0), coordinates: coords, startLabel, endLabel });
        });
        mapRef.current._routesClickAttached = true;
      }
      console.log('Routes drawn, count=', features.length);
      persistGeocodeCache();
    } catch (e) { console.error('fetchAndDrawRoutes failed', e); }
  }

  /********** AppSync init (run after mapReady) **********/
  useEffect(() => {
    if (!mapReady) { console.log('map not ready — delaying AppSync init'); return; }
    let mounted = true;
    clientRef.current = generateClient();
    async function init() {
      try {
        console.log('[init] fetching initial incidents');
        const listRes = await clientRef.current.graphql({ query: LIST_INCIDENTS });
        const itemsRaw = listRes?.data?.listIncidents?.items ?? [];
        const normalized = (itemsRaw || []).map(normalizeIncident).filter(Boolean);
        if (!mounted) return;
        applyIncidents(normalized);
        setLoading(false); // <--- THIS IS NOW REACHABLE
        
        fetchAndDrawRoutes();
        
        try {
          console.log('[init] attempting push subscription');
          const subscription = clientRef.current.graphql({ query: ON_NEW_INCIDENT }).subscribe({
            next: (payload) => {
              const newItemRaw = payload?.data?.onNewIncident ?? payload?.value?.data?.onNewIncident;
              if (!newItemRaw) return;
              const newItem = normalizeIncident(newItemRaw);
              setNewIncidentAlert(newItem);
              setIncidents(prev => {
                const map = new Map(prev.map(i => [i.incidentId, i]));
                map.set(newItem.incidentId, newItem);
                const arr = Array.from(map.values());
                updateMarkers(arr);
                return arr;
              });
            },
            error: (err) => { console.error('[subscription] transport error', err); startPolling(); },
          });
          subRef.current = subscription;
          stopPolling();
        } catch (subErr) { console.error('[init] subscription setup failed', subErr); startPolling(); }
      } catch (err) { console.error('[init] initial fetch error', err); startPolling(); }
    }
    init();
    return () => { mounted = false; try { subRef.current && subRef.current.unsubscribe(); } catch (e) {} stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  /********** Periodic refresh of routes (optional) **********/
  useEffect(() => {
    if (!mapReady) return;
    const id = setInterval(() => { fetchAndDrawRoutes(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [mapReady]);

  /********** UI Handlers **********/
  function closeSummaryBar() {
    setSelectedRoute(null);
    if (mapRef.current) mapRef.current.setFilter('routes-line-highlight', ['==', ['get', 'assetId'], '']);
  }
  function handleAlertClick() {
    if (!newIncidentAlert || !mapRef.current) return;
    const { longitude, latitude } = newIncidentAlert;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      try { mapRef.current.easeTo({ center: [longitude, latitude], zoom: 16, pitch: 60, bearing: 0, duration: 1500 }); } catch (e) { console.error('Failed to easeTo new incident', e); }
    }
    setNewIncidentAlert(null);
  }
  function toggleIncidentList() { setIsIncidentListOpen(prev => !prev); }
  function handleIncidentSelect(incident) {
    if (!incident || !mapRef.current) return;
    const { incidentId, longitude, latitude } = incident;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        try {
            const map = mapRef.current;
            map.easeTo({ center: [longitude, latitude], duration: 1200 });

            // Close any existing popups
            for (const m of markersRef.current.values()) {
                try { m.popup.remove(); } catch (err) {}
            }

            // Find and show the popup for the selected incident
            const markerMeta = markersRef.current.get(incidentId);
            if (markerMeta && markerMeta.popup) {
                markerMeta.popup.addTo(map).setLngLat([longitude, latitude]);
            }
        } catch (e) {
            console.error('Failed to easeTo or show popup for selected incident', e);
        }
    }
    setIsIncidentListOpen(false);
  }


  // NEW: 2. Add the handler function for the reset button
  function resetMapView() {
    if (!mapRef.current) return;
    mapRef.current.easeTo({
        center: [0, 20],
        zoom: 1.5,
        pitch: 0,
        bearing: 0,
        duration: 1500
    });
}



  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto' }}>

      <style>{`
        @keyframes pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(211, 47, 47, 0); }
          100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
        }
      `}</style>

      {/* NEW: 3. Render the new button. We'll hide it if a new incident alert is shown to avoid overlap. */}
      {!newIncidentAlert && <ResetViewButton onClick={resetMapView} />}


      <NewIncidentNotification incident={newIncidentAlert} onClick={handleAlertClick} />

      {loading ? (
        <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 1002, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 12px', borderRadius: 6 }}>
          Loading incidents and routes...
        </div>
      ) : (
        <>
            <IncidentCounter count={incidents.length} onClick={toggleIncidentList} />
            {isIncidentListOpen && (
                <IncidentList incidents={incidents} onIncidentSelect={handleIncidentSelect} />
            )}
        </>
      )}

      {selectedRoute && (
        <div style={{ position: 'absolute', left: 16, bottom: 20, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.96)', color: '#111', padding: '10px 12px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 300, maxWidth: '60vw' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedRoute.assetId}</div>
            <div style={{ fontSize: 12, color: '#444' }}>{selectedRoute.type} • {selectedRoute.nodeCount} nodes</div>
            <div style={{ marginTop: 6, fontSize: 13, color: '#333' }}>
              <div><strong>From</strong>: {selectedRoute.startLabel || 'Unknown'}</div>
              <div style={{ marginTop: 4 }}><strong>To</strong>: {selectedRoute.endLabel || 'Unknown'}</div>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => { const coords = selectedRoute.coordinates; const lats = coords.map(c => c[1]), lons = coords.map(c => c[0]); const minLat = Math.min(...lats), maxLat = Math.max(...lats); const minLon = Math.min(...lons), maxLon = Math.max(...lons); try { mapRef.current && mapRef.current.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 80, duration: 800 }); } catch (e) {} }} style={{ background: '#0078D4', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Zoom</button>
            <button onClick={() => { const coords = selectedRoute.coordinates; const first = coords && coords[0]; if (first && mapRef.current) { try { mapRef.current.easeTo({ center: first, zoom: 6, duration: 800 }); } catch (e) {} } }} style={{ background: '#eee', color: '#111', border: '1px solid #ddd', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Center</button>
            <button onClick={closeSummaryBar} aria-label="Close" style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: '#444' }}>✕</button>
          </div>
        </div>
      )}



      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* NEW: Add the ChatWindow component here */}
      <ChatWindow />


    </div>
  );
}