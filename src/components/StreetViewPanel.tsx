import { useState } from 'react';
import { Compass, ExternalLink, Maximize2, Minimize2, X, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';
import { clearStreetViewMarker } from '../analysis/streetView';

export default function StreetViewPanel() {
  const loc = useAppStore((s) => s.streetViewLocation);
  const setLoc = useAppStore((s) => s.setStreetViewLocation);
  const [maximized, setMaximized] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!loc) return null;

  const { lat, lon } = loc;
  const embedUrl = `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lon}&cbp=11,0,0,0,0&output=svembed`;
  const externalUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;

  const handleOpenExternal = () => {
    if (window.geodeskUpdate?.openExternal) {
      window.geodeskUpdate.openExternal(externalUrl);
    } else {
      window.open(externalUrl, '_blank');
    }
  };

  const handleClose = () => {
    setLoc(null);
    clearStreetViewMarker();
  };

  return (
    <div className={`street-view-panel ${maximized ? 'maximized' : ''}`}>
      <div className="street-view-header">
        <div className="street-view-title">
          <Compass size={16} className="street-view-icon" />
          <span className="street-view-name">Google Street View 360°</span>
          <span className="street-view-coords">
            {lat.toFixed(5)}°, {lon.toFixed(5)}°
          </span>
        </div>
        <div className="street-view-actions">
          <button
            type="button"
            className="street-view-btn"
            title="Recarregar panorama"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="street-view-btn"
            title="Abrir no Google Maps (Navegador)"
            onClick={handleOpenExternal}
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            className="street-view-btn"
            title={maximized ? 'Restaurar tamanho compacto' : 'Maximizar'}
            onClick={() => setMaximized(!maximized)}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            className="street-view-btn street-view-close"
            title="Fechar Street View"
            onClick={handleClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="street-view-body">
        <iframe
          key={`${lat}-${lon}-${refreshKey}`}
          title="Google Street View"
          src={embedUrl}
          className="street-view-iframe"
          allowFullScreen
          loading="lazy"
        />
      </div>

      <div className="street-view-footer">
        <span>Arraste para girar em 360° · Clique nas setas para andar pela via · Clique no mapa para mudar de ponto</span>
      </div>
    </div>
  );
}
