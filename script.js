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

    layers.forEach(lyr => {
        map.on('click', lyr, (e) => {
            const props = e.features[0].properties;
            const isAlive = props.is_alive == 1 ? 'Oui' : 'Non';
            
            new maplibregl.Popup({ closeButton: true })
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="padding: 5px;">
                        <h3 style="font-weight: 700; margin-bottom: 5px; font-size: 1.2rem;">
                            <a href="https://www.wikidata.org/wiki/${props.wikidata_code}" target="_blank" style="color:white; text-decoration: none;">
                                ${props.name}
                            </a>
                        </h3>
                        <p style="color: var(--text-secondary); margin-bottom: 2px;">Rang (notoriété): <b>${props.rank}</b></p>
                        <p style="color: var(--accent); font-size: 0.9em;">En vie: ${isAlive}</p>
                    </div>
                `)
                .addTo(map);
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
