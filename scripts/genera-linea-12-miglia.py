"""Genera il profilo indicativo a 12 NM dalla terra Natural Earth 1:10m."""
import json
import sys
import zipfile
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import box, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

DISTANZA_METRI = 12 * 1852
OVEST, SUD, EST, NORD = -7, 30, 37, 47
PASSO = 2
MARGINE = 0.6


def main(archivio, destinazione):
    with zipfile.ZipFile(archivio) as fonte:
        with fonte.open("ne_10m_land.shp") as shp, fonte.open("ne_10m_land.shx") as shx:
            lettore = shapefile.Reader(shp=shp, shx=shx)
            terre = [shape(elemento.__geo_interface__) for elemento in lettore.shapes()]
    indice = STRtree(terre)
    linee = []
    for ovest in range(OVEST, EST, PASSO):
        for sud in range(SUD, NORD, PASSO):
            cella = box(ovest, sud, min(ovest + PASSO, EST), min(sud + PASSO, NORD))
            estesa = box(ovest - MARGINE, sud - MARGINE,
                         min(ovest + PASSO, EST) + MARGINE, min(sud + PASSO, NORD) + MARGINE)
            candidati = indice.query(estesa, predicate="intersects")
            if not len(candidati):
                continue
            terra = unary_union([terre[i].intersection(estesa) for i in candidati])
            if terra.is_empty:
                continue
            lon, lat = cella.centroid.x, cella.centroid.y
            crs = f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"
            avanti = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform
            indietro = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
            profilo = transform(indietro, transform(avanti, terra).buffer(DISTANZA_METRI, quad_segs=12).boundary)
            risultato = profilo.intersection(cella)
            if not risultato.is_empty:
                linee.append({"type": "Feature", "properties": {}, "geometry": mapping(risultato)})
    dati = {"type": "FeatureCollection", "features": linee}
    Path(destinazione).write_text(json.dumps(dati, separators=(",", ":")), encoding="utf-8")
    print(f"Generate {len(linee)} celle in {destinazione}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: python scripts/genera-linea-12-miglia.py ne_10m_land.zip output.geojson")
    main(sys.argv[1], sys.argv[2])
