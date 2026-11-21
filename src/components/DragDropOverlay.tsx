import { useEffect, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { loadShapefile } from '../import/shpLoader';
import { loadGeoJSONFile } from '../import/geojsonLoader';
import { loadGeoPackage, isGeoPackageFile } from '../import/gpkgLoader';
import { loadQgisProject, isQgisProjectFile } from '../import/qgisProject';
import { loadMxdProject, isMxdProjectFile } from '../import/mxdProject';
import { loadProjectFile } from '../export/projectManager';
import { useAppStore } from '../store';

export default function DragDropOverlay() {
  const [isDragging, setIsDragging] = useState(false);
  const setStatus = useAppStore((s) => s.setStatus);

  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        setIsDragging(false);
        dragCounter = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter = 0;

      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;

      const geodeskFiles = files.filter((f) => f.name.toLowerCase().endsWith('.geodesk'));
      const mxdFiles = files.filter((f) => isMxdProjectFile(f.name));
      const qgisFiles = files.filter((f) => isQgisProjectFile(f.name));
      const gpkgFiles = files.filter((f) => isGeoPackageFile(f.name));
      const shpFiles = files.filter((f) => f.name.toLowerCase().endsWith('.shp'));
      const geojsonFiles = files.filter(
        (f) => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'),
      );

      try {
        if (geodeskFiles.length > 0) {
          for (const project of geodeskFiles) {
            setStatus(`Processando projeto GeoDesk "${project.name}"…`);
            await loadProjectFile(project);
          }
        } else if (mxdFiles.length > 0) {
          for (const project of mxdFiles) {
            setStatus(`Processando projeto ArcMap "${project.name}"…`);
            await loadMxdProject(project);
          }
        } else if (qgisFiles.length > 0) {
          for (const project of qgisFiles) {
            setStatus(`Processando projeto QGIS "${project.name}"…`);
            await loadQgisProject(project);
          }
        } else if (gpkgFiles.length > 0) {
          for (const gpkg of gpkgFiles) {
            setStatus(`Processando GeoPackage "${gpkg.name}"…`);
            await loadGeoPackage(gpkg);
          }
        } else if (shpFiles.length > 0) {
          setStatus('Processando arquivo(s) Shapefile arrastado(s)…');
          await loadShapefile(files);
          setStatus(`Shapefile "${shpFiles[0].name}" carregado com sucesso.`);
        } else if (geojsonFiles.length > 0) {
          setStatus('Processando arquivo(s) GeoJSON arrastado(s)…');
          for (const gf of geojsonFiles) {
            await loadGeoJSONFile(gf);
          }
          setStatus(`GeoJSON carregado com sucesso.`);
        } else {
          setStatus(
            'Formato não suportado: solte arquivos .geodesk, .mxd, .shp, .geojson, .gpkg ou .qgs/.qgz',
          );
        }
      } catch (err) {
        setStatus(`Erro ao carregar arquivos: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [setStatus]);

  if (!isDragging) return null;

  return (
    <div className="global-drag-overlay">
      <div className="global-drag-card">
        <div className="global-drag-icon-box">
          <UploadCloud size={36} color="var(--accent)" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 6px', color: 'var(--text)' }}>
          Solte os arquivos para importar
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 380, textAlign: 'center' }}>
          Suporta <strong>GeoDesk</strong> (.geodesk), <strong>ArcGIS</strong> (.mxd),{' '}
          <strong>QGIS</strong> (.qgs, .qgz), <strong>Shapefile</strong> (.shp),{' '}
          <strong>GeoJSON</strong> (.geojson) e <strong>GeoPackage</strong> (.gpkg).
        </p>
      </div>
    </div>
  );
}
