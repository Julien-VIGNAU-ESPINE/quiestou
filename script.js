const ACCESS_TOKEN = 'pk.eyJ1IjoidGp1a2Fub3Z0IiwiYSI6ImNsNjRwY3ZqaTByZGgzZG81d21jY2QwOHUifQ.8uZ5wiR2UIvaPHcCTP4wzw';

const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [2.5, 46.5],
    zoom: 4,
    minZoom: 2,
    maxZoom: 12,
    pitch: 5,
    fadeDuration: 0
});

map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true
}), 'bottom-right');

map.on('load', () => {
    // Hide Carto basemap text labels so they don't conflict with our names
    map.getStyle().layers.forEach(layer => {
        if (layer.type === 'symbol' || layer.id.includes('place') || layer.id.includes('label')) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
    });

    map.addSource('notable-people-src', {
        type: 'vector',
        tiles: [
            `http://localhost:8000/proxy/api.mapbox.com/v4/tjukanovt.notable-people-v3/{z}/{x}/{y}.vector.pbf?access_token=${ACCESS_TOKEN}`
        ],
        minzoom: 0,
        maxzoom: 14
    });

    const createLayer = (id, sourceLayer) => {
        return {
            'id': id,
            'type': 'symbol',
            'source': 'notable-people-src',
            'source-layer': sourceLayer,
            'layout': {
                'visibility': id === 'All' ? 'visible' : 'none',
                'symbol-sort-key': ["get", "rank"],
                'text-field': ["to-string", ["get", "name"]],
                'text-font': ['Roboto Regular'],
                'text-allow-overlap': false,
                'text-size': [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    0, ["interpolate", ["exponential", 1.21], ["get", "sum"], 9.15, 9.5, 41.76, 14],
                    10, ["interpolate", ["exponential", 1.5], ["get", "sum"], 9.15, 15, 35, 26]
                ],
            },
            'paint': {
                 "text-color": [
                    "step",
                    ["get", "rank"],
                    "#e0f2fe",
                    100, "#fed7aa",
                    500, "#d8b4fe",
                    1000, "#fbcfe8"
                ],
                "text-halo-color": "#000000",
                "text-halo-width": 2.5,
                "text-halo-blur": 0.5
            }
        };
    };

    map.addLayer(createLayer('All', 'notable-people'));
    map.addLayer(createLayer('Culture', 'culture'));
    map.addLayer(createLayer('Science', 'science'));
    map.addLayer(createLayer('Leadership', 'leadership'));
    map.addLayer(createLayer('Sports', 'sport'));

    const filterBtns = document.querySelectorAll('.filter-btn');
    const layers = ['All', 'Culture', 'Science', 'Leadership', 'Sports'];
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const activeCat = e.target.getAttribute('data-category');
            layers.forEach(lyr => {
                map.setLayoutProperty(lyr, 'visibility', lyr === activeCat ? 'visible' : 'none');
            });
        });
    });

    const wikiPanel = document.getElementById('wikiPanel');
    const wikiPanelContent = document.getElementById('wikiPanelContent');
    const closeWikiPanel = document.getElementById('closeWikiPanel');

    closeWikiPanel.addEventListener('click', () => {
        wikiPanel.classList.remove('open');
    });

    layers.forEach(lyr => {
        map.on('click', lyr, async (e) => {
            const props = e.features[0].properties;
            const isAlive = props.is_alive == 1 ? 'Oui' : 'Non';
            const gender = props.gender || 'Inconnu';
            
            wikiPanel.classList.add('open');
            wikiPanelContent.innerHTML = `<p style="color:white; text-align:center; margin-top:50px; font-family:'Outfit';">Chargement de Wikipédia...</p>`;

            try {
                const wdRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${props.wikidata_code}&props=sitelinks&format=json&origin=*`);
                const wdData = await wdRes.json();
                
                let wikiTitle = props.name;
                let lang = 'en';

                const entity = wdData.entities[props.wikidata_code];
                if (entity && entity.sitelinks) {
                    if (entity.sitelinks.frwiki) {
                        wikiTitle = entity.sitelinks.frwiki.title;
                        lang = 'fr';
                    } else if (entity.sitelinks.enwiki) {
                        wikiTitle = entity.sitelinks.enwiki.title;
                        lang = 'en';
                    }
                }

                const wpRes = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
                const wpData = await wpRes.json();

                const imageUrl = wpData.thumbnail ? wpData.thumbnail.source : '';
                const extract = wpData.extract || 'Aucune description disponible.';
                const wpLink = wpData.content_urls ? wpData.content_urls.desktop.page : `https://www.wikidata.org/wiki/${props.wikidata_code}`;

                let html = '';
                if (imageUrl) {
                    html += `<div class="wiki-image-container"><img src="${imageUrl}" alt="${props.name}"></div>`;
                }
                html += `
                    <h2 class="wiki-title">${props.name}</h2>
                    <div class="wiki-subtitle">Wikidata: ${props.wikidata_code}</div>
                    <div class="wiki-extract">${extract}</div>
                    
                    <div class="wiki-stats">
                        <p><span>Catégorie</span> <b>${lyr === 'All' ? 'Inconnue' : lyr}</b></p>
                        <p><span>Rang Notoriété</span> <b>#${props.rank}</b></p>
                        <p><span>En vie</span> <b>${isAlive}</b></p>
                    </div>
                    
                    <a href="${wpLink}" target="_blank" class="wiki-link-btn">Lire l'article Wikipédia</a>
                `;
                
                wikiPanelContent.innerHTML = html;

            } catch (err) {
                console.error(err);
                wikiPanelContent.innerHTML = `
                    <h2 class="wiki-title">${props.name}</h2>
                    <p style="color: var(--text-secondary); margin-top:20px;">Impossible de charger les données Wikipédia.</p>
                `;
            }
        });

        map.on('mouseenter', lyr, () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', lyr, () => {
            map.getCanvas().style.cursor = '';
        });
    });

    // Search logic
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    searchBtn.addEventListener('click', async () => {
        const q = searchInput.value.trim();
        if (!q) return;
        searchBtn.innerText = '...';
        try {
            const res = await fetch(`http://localhost:8000/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                map.flyTo({ center: [data.lon, data.lat], zoom: 10, speed: 1.5 });
                new maplibregl.Popup({ closeButton: false, closeOnClick: true })
                    .setLngLat([data.lon, data.lat])
                    .setHTML(`<div style="padding: 2px; font-weight: bold; color: var(--accent);">${data.name}</div>`)
                    .addTo(map);
            } else {
                alert('Introuvable sur Wikipédia/Wikidata.');
            }
        } catch(e) {
            console.error(e);
        }
        searchBtn.innerText = 'Go';
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn.click();
    });
});
