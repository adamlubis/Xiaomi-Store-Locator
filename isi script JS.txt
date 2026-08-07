// ==========================================
// 1. INISIALISASI PETA LEAFLET
// ==========================================
const map = L.map('map').setView([-2.548926, 118.014863], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let allStores = [];
let filteredStores = [];
let markersLayer = L.layerGroup().addTo(map);
let radiusCirclesGroup = L.layerGroup().addTo(map);
let connectionLinesGroup = L.layerGroup().addTo(map);

let currentActiveStore = null;

// Default Status: NO STORE tersembunyi (hanya EXISTING & PROGRESS yang aktif)
const selectedFilters = {
  partner: [],
  region: [],
  province: [],
  city: [],
  type: [],
  grade: [],
  status: ['EXISTING', 'PROGRESS']
};

// ==========================================
// 2. HELPER FUNCTIONS & PIN MAP MARKER GENERATOR
// ==========================================

// Ukuran Map Pin Ringkas (Proposional & Tidak Saling Bertumpuk)
function getPinSizeByZoom(zoomLevel) {
  if (zoomLevel >= 15) return { width: 30, height: 40 }; // Zoom Sangat Dekat
  if (zoomLevel >= 12) return { width: 24, height: 32 }; // Zoom Kota
  if (zoomLevel >= 9)  return { width: 18, height: 24 }; // Zoom Provinsi / Pulau
  return { width: 14, height: 18 };                       // Zoom Out Indonesia
}

// Generator Map Pin Vector (Kiri Shading + Ring Tengah)
function createMapPinIcon(status, zoomLevel) {
  const { width, height } = getPinSizeByZoom(zoomLevel);
  const st = String(status || '').toUpperCase();

  let lightColor = '#FF6900'; // Orange Xiaomi Terang (EXISTING)
  let darkColor  = '#D95300';

  if (st === 'PROGRESS' || st === 'UPCOMING') {
    lightColor = '#2563EB';  // Biru (PROGRESS)
    darkColor  = '#1D4ED8';
  } else if (st === 'NO STORE' || st === 'POTENTIAL' || st === 'NO MALL') {
    lightColor = '#059669';  // Hijau (NO STORE)
    darkColor  = '#047857';
  }

  // SVG Pin dengan border putih & shading 2 warna
  const svgPin = `
    <svg viewBox="0 0 100 130" style="width: 100%; height: 100%; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.35));" xmlns="http://www.w3.org/2000/svg">
      <!-- Border Putih Luar -->
      <path d="M50 0 C22.386 0 0 22.386 0 50 C0 80 50 130 50 130 C50 130 100 80 100 50 C100 22.386 77.614 0 50 0 Z" fill="#FFFFFF"/>
      
      <!-- Sisi Kanan (Warna Terang) -->
      <path d="M50 6 C25.7 6 6 25.7 6 50 C6 76 50 121 50 121 Z" fill="${lightColor}"/>
      
      <!-- Sisi Kiri (Warna Gelap / Shading) -->
      <path d="M50 6 C74.3 6 94 25.7 94 50 C94 76 50 121 50 121 Z" fill="${darkColor}"/>
      
      <!-- Bulatan Tengah Putih (Ring) -->
      <circle cx="50" cy="48" r="18" fill="#FFFFFF"/>
      <!-- Inner Hole -->
      <circle cx="50" cy="48" r="10" fill="${lightColor}"/>
    </svg>
  `;

  return L.divIcon({
    className: 'custom-map-pin-icon',
    html: `<div style="width: ${width}px; height: ${height}px;">${svgPin}</div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height], // Anchor tepat di ujung bawah
    popupAnchor: [0, -height]
  });
}

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? NaN : num;
  }
  return NaN;
}

function getTextVal(val) {
  if (val === undefined || val === null || val === '') return '-';
  return String(val).trim();
}

function formatPopulation(val) {
  if (val === undefined || val === null || val === '' || val === '-') return '-';
  const cleaned = String(val).replace(/[^0-9]/g, '');
  if (!cleaned) return String(val);
  return Number(cleaned).toLocaleString('en-US');
}

function getGradeVal(store) {
  return store["Grade"] || store["Mall Grade"] || store["Mall_Grade"] || store["Grade Mall"] || store["GRADE"] || store["Store Grade"] || '';
}

function getDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(distKm) {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(2)} km`;
}

function normalizeCityName(cityName) {
  if (!cityName) return '';
  return cityName
    .toString()
    .toLowerCase()
    .replace(/^(kota|kabupaten|kab\.)\s+/g, '')
    .trim();
}

async function fetchJsonData(fileName) {
  const paths = [
    `../output/${fileName}`,
    `output/${fileName}`,
    `./output/${fileName}`,
    `./${fileName}`,
    fileName
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {}
  }
  return [];
}

// ==========================================
// 3. LOAD DATA
// ==========================================
async function loadStoresData() {
  const storesData = await fetchJsonData('stores.json');
  const candidatesData = await fetchJsonData('mall_candidate.json');

  const formattedStores = storesData.map(s => {
    let st = String(s.Status || 'EXISTING').trim().toUpperCase();
    if (st.includes('EXIST')) st = 'EXISTING';
    else if (st.includes('PROGRESS') || st.includes('UPCOMING')) st = 'PROGRESS';
    else st = 'EXISTING';
    return { ...s, Status: st };
  });

  const formattedCandidates = candidatesData.map(c => {
    return { ...c, Status: 'NO STORE', isCandidate: true };
  });

  allStores = [...formattedStores, ...formattedCandidates];

  setupMultiSelects();
  applyFilters(); // Filter diawal agar NO STORE otomatis tersembunyi
}

loadStoresData();

// ==========================================
// 4. MULTI-SELECT DROPDOWN LOGIC
// ==========================================
const filterConfigs = [
  { id: 'ms-partner', key: 'partner', field: 'Partner', label: 'Partner' },
  { id: 'ms-region', key: 'region', field: 'Region', label: 'Region' },
  { id: 'ms-province', key: 'province', field: 'Province', label: 'Province' },
  { id: 'ms-city', key: 'city', field: 'City', label: 'City' },
  { id: 'ms-type', key: 'type', field: 'Type', label: 'Type' },
  { id: 'ms-grade', key: 'grade', customGetter: getGradeVal, label: 'Mall Grade' },
  { id: 'ms-status', key: 'status', customOptions: ['EXISTING', 'PROGRESS', 'NO STORE'], label: 'Status' }
];

function setupMultiSelects() {
  filterConfigs.forEach(cfg => {
    const container = document.getElementById(cfg.id);
    if (!container) return;

    const btn = container.querySelector('.multiselect-btn');
    const dropdown = container.querySelector('.multiselect-dropdown');

    let options = [];
    if (cfg.customOptions) {
      options = cfg.customOptions;
    } else {
      options = [...new Set(allStores.map(item => {
        return cfg.customGetter ? cfg.customGetter(item) : item[cfg.field];
      }).filter(Boolean))].sort();
    }

    dropdown.innerHTML = '';
    options.forEach(optVal => {
      // Cek apakah opsi ini harus tercentang secara default
      const isChecked = selectedFilters[cfg.key].includes(optVal);

      const label = document.createElement('label');
      label.className = 'multiselect-option';
      label.innerHTML = `
        <input type="checkbox" value="${optVal}" ${isChecked ? 'checked' : ''}>
        <span>${optVal}</span>
      `;

      const checkbox = label.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedFilters[cfg.key].push(optVal);
        } else {
          selectedFilters[cfg.key] = selectedFilters[cfg.key].filter(v => v !== optVal);
        }
        updateBtnLabel(btn, cfg.label, selectedFilters[cfg.key]);
        applyFilters();
      });

      dropdown.appendChild(label);
    });

    updateBtnLabel(btn, cfg.label, selectedFilters[cfg.key]);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.multiselect-dropdown').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });
      dropdown.classList.toggle('show');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('show'));
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', applyFilters);

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
}

function updateBtnLabel(btn, defaultLabel, selectedArray) {
  const span = btn.querySelector('span');
  if (!span) return;
  if (selectedArray.length === 0) {
    span.textContent = defaultLabel;
  } else if (selectedArray.length === 1) {
    span.textContent = selectedArray[0];
  } else {
    span.textContent = `${defaultLabel} (${selectedArray.length})`;
  }
}

// ==========================================
// 5. FILTER LOGIC
// ==========================================
function applyFilters() {
  const searchInput = document.getElementById('search-input');
  const searchVal = searchInput ? searchInput.value.toLowerCase() : '';

  filteredStores = allStores.filter(store => {
    const storeName = store["Store Name"] || store["Mall Name"] || store["Name"] || '';
    const storeGrade = getGradeVal(store);
    const storeStatus = store["Status"] || 'NO STORE';

    const matchSearch = !searchVal || 
      storeName.toLowerCase().includes(searchVal) ||
      (store["Partner"] || '').toLowerCase().includes(searchVal) ||
      (store["City"] || '').toLowerCase().includes(searchVal) ||
      storeGrade.toLowerCase().includes(searchVal);

    const matchPartner = selectedFilters.partner.length === 0 || selectedFilters.partner.includes(store["Partner"]);
    const matchRegion = selectedFilters.region.length === 0 || selectedFilters.region.includes(store["Region"]);
    const matchProvince = selectedFilters.province.length === 0 || selectedFilters.province.includes(store["Province"]);
    const matchCity = selectedFilters.city.length === 0 || selectedFilters.city.includes(store["City"]);
    const matchType = selectedFilters.type.length === 0 || selectedFilters.type.includes(store["Type"]);
    const matchGrade = selectedFilters.grade.length === 0 || selectedFilters.grade.includes(storeGrade);
    const matchStatus = selectedFilters.status.length === 0 || selectedFilters.status.includes(storeStatus);

    return matchSearch && matchPartner && matchRegion && matchProvince && matchCity && matchType && matchGrade && matchStatus;
  });

  closeRightRadiusPanel();
  updateDashboard();
}

function resetFilters() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  filterConfigs.forEach(cfg => {
    // Reset status ke default (tanpa NO STORE), sisanya kosongkan
    if (cfg.key === 'status') {
      selectedFilters[cfg.key] = ['EXISTING', 'PROGRESS'];
    } else {
      selectedFilters[cfg.key] = [];
    }

    const container = document.getElementById(cfg.id);
    if (container) {
      const btn = container.querySelector('.multiselect-btn');
      updateBtnLabel(btn, cfg.label, selectedFilters[cfg.key]);
      
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = selectedFilters[cfg.key].includes(cb.value);
      });
    }
  });

  closeRightRadiusPanel();
  applyFilters();
}

// ==========================================
// 6. UPDATE DASHBOARD & COUNTERS
// ==========================================
function updateDashboard() {
  const existing = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'EXISTING').length;
  const progress = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'PROGRESS').length;
  const noStore = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'NO STORE').length;

  const totalAllLocations = filteredStores.length;

  const statTotal = document.getElementById('stat-total');
  const statExisting = document.getElementById('stat-existing');
  const statProgress = document.getElementById('stat-progress');
  const statNoStore = document.getElementById('stat-nostore');
  const storesFound = document.getElementById('stores-found-text');

  if (statTotal) statTotal.textContent = totalAllLocations;
  if (statExisting) statExisting.textContent = existing;
  if (statProgress) statProgress.textContent = progress;
  if (statNoStore) statNoStore.textContent = noStore;
  if (storesFound) storesFound.textContent = `${totalAllLocations} lokasi ditemukan`;

  renderStoreList();
  renderMarkers();
}

// ==========================================
// 7. RENDER STORE LIST (PANEL KIRI)
// ==========================================
function renderStoreList() {
  const listContainer = document.getElementById('store-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  filteredStores.forEach(store => {
    const status = store["Status"] || 'NO STORE';

    let badgeClass = 'badge-progress';
    if (status === 'EXISTING') badgeClass = 'badge-existing';
    if (status === 'NO STORE') badgeClass = 'badge-nostore';

    const storeGrade = getGradeVal(store);
    const gradeBadgeHtml = storeGrade ? `<span class="badge badge-grade" style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; margin-right:4px;">${storeGrade}</span>` : '';
    const name = store["Store Name"] || store["Mall Name"] || store["Name"] || 'Xiaomi Store / Mall';

    const mapsLink = getTextVal(store['Google Maps Link'] || store['Popul Link'] || store['Maps Link']);
    const rawPop = store['POPULATION'] || store['Population'] || store['City Population'];
    const populationFormatted = formatPopulation(rawPop);

    const mapsBtnHtml = (mapsLink && mapsLink !== '-') 
      ? `<div class="maps-link-container"><a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="btn-maps-link">📍 Maps Link</a></div>` 
      : '';

    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${name}</div>
        <div class="badge-group">
          ${gradeBadgeHtml}
          <span class="badge ${badgeClass}">${status}</span>
        </div>
      </div>
      
      ${mapsBtnHtml}

      <div class="card-partner">🏢 ${store["Partner"] || '-'}</div>
      <div class="card-address">📍 ${store["City"] || ''}, ${store["Province"] || ''}</div>

      <div class="store-extra-info" style="margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 6px; font-size: 11px;">
        <div>
          <span style="color: #64748b; display: block;">City Population:</span> 
          <strong style="color: #1e293b; font-size: 12px;">${populationFormatted}</strong>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      const lat = parseNum(store["Latitude"]);
      const lng = parseNum(store["Longitude"]);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 13);
        selectStoreAndTriggerRadius(store);
      }
    });

    listContainer.appendChild(card);
  });
}

// ==========================================
// 8. RENDER MARKERS DENGAN MAP PIN VECTOR
// ==========================================
function renderMarkers() {
  markersLayer.clearLayers();
  const currentZoom = map.getZoom();

  filteredStores.forEach(store => {
    const lat = parseNum(store["Latitude"]);
    const lng = parseNum(store["Longitude"]);

    if (isNaN(lat) || isNaN(lng)) return;

    const status = store["Status"];

    // Buat marker dengan Custom Map Pin Vector
    const pinIcon = createMapPinIcon(status, currentZoom);
    const marker = L.marker([lat, lng], { icon: pinIcon });

    const storeGrade = getGradeVal(store);
    const name = store["Store Name"] || store["Mall Name"] || store["Name"] || 'Xiaomi Store / Mall';
    const rawCost = parseNum(store["Rental Cost"]);
    const rentalCost = !isNaN(rawCost) ? `Rp ${new Intl.NumberFormat('id-ID').format(rawCost)}` : '-';

    const mapsLink = getTextVal(store['Google Maps Link'] || store['Popul Link'] || store['Maps Link']);
    const rawPop = store['POPULATION'] || store['Population'] || store['City Population'];
    const populationFormatted = formatPopulation(rawPop);
    
    const dailyTraffic = getTextVal(store['Daily Traffic (Est)'] || store['Daily Traffic'] || store['Traffic']);
    const monthlyTraffic = getTextVal(store['Monthly Traffic (Est)'] || store['Monthly Traffic']);

    const mapsBtnHtml = (mapsLink && mapsLink !== '-') 
      ? `<div class="maps-link-container" style="margin-top:4px;"><a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="btn-maps-link">📍 Maps Link</a></div>` 
      : '';

    const popupContent = `
      <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">${name}</div>
      <div style="font-size:11px; color:#666; margin-bottom:6px;">${store["Address"] || ''}</div>
      
      ${mapsBtnHtml}

      <div style="font-size:11px; line-height:1.5; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px;">
        <b>Partner:</b> ${store["Partner"] || '-'}<br>
        <b>Region:</b> ${store["Region"] || '-'}<br>
        <b>Mall Grade:</b> ${storeGrade || '-'}<br>
        <b>Status:</b> ${status}<br>
        <b>Size:</b> ${store["Store Size"] || '-'} sqm<br>
        <b>Rental:</b> ${rentalCost}<br>
        <b>City Population:</b> ${populationFormatted}<br>
        <b>Daily Traffic (Est):</b> ${dailyTraffic}<br>
        <b>Monthly Traffic (Est):</b> ${monthlyTraffic}
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.on('click', () => {
      selectStoreAndTriggerRadius(store);
    });
    markersLayer.addLayer(marker);
  });
}

// Event Listener Zoom
map.on('zoomend', function() {
  renderMarkers();
});

// ==========================================
// 9. PANEL RADIUS KOTA SAMA
// ==========================================
function selectStoreAndTriggerRadius(store) {
  currentActiveStore = store;
  updateRadiusPanelUI();
}

function updateRadiusPanelUI() {
  if (!currentActiveStore) return;

  const targetLat = parseNum(currentActiveStore["Latitude"]);
  const targetLng = parseNum(currentActiveStore["Longitude"]);

  if (isNaN(targetLat) || isNaN(targetLng)) return;

  const targetCityRaw = currentActiveStore["City"] || currentActiveStore["City/Kabupaten"] || currentActiveStore["Kabupaten"] || '';
  const targetCityNorm = normalizeCityName(targetCityRaw);

  const sameCityStores = filteredStores.filter(store => {
    if (store["Latitude"] === currentActiveStore["Latitude"] && store["Longitude"] === currentActiveStore["Longitude"]) {
      return false;
    }

    const currentCityRaw = store["City"] || store["City/Kabupaten"] || store["Kabupaten"] || '';
    const currentCityNorm = normalizeCityName(currentCityRaw);

    return currentCityNorm !== '' && currentCityNorm === targetCityNorm;
  });

  const storeDistances = sameCityStores.map(store => {
    const sLat = parseNum(store["Latitude"]);
    const sLng = parseNum(store["Longitude"]);
    if (isNaN(sLat) || isNaN(sLng)) return null;

    const distance = getDistanceInKm(targetLat, targetLng, sLat, sLng);
    return { ...store, distance };
  })
  .filter(Boolean)
  .sort((a, b) => a.distance - b.distance);

  connectionLinesGroup.clearLayers();
  renderRightRadiusPanelHTML(currentActiveStore, storeDistances, targetCityRaw);
}

function renderRightRadiusPanelHTML(activeStore, sameCityStoresSorted, cityName) {
  let panel = document.getElementById('right-info-panel');
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'right-info-panel';
    panel.className = 'right-info-panel';
    const mapContainer = document.querySelector('.map-container') || document.body;
    mapContainer.appendChild(panel);
  }

  const activeName = activeStore["Store Name"] || activeStore["Mall Name"] || activeStore["Name"];
  const totalInCity = sameCityStoresSorted.length;

  let locationsHtml = '';
  if (totalInCity === 0) {
    locationsHtml = `
      <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 12px; font-style: italic;">
        Tidak ada lokasi store lain di ${cityName || 'kota ini'}.
      </div>`;
  } else {
    sameCityStoresSorted.forEach(store => {
      const name = store["Store Name"] || store["Mall Name"] || store["Name"];
      const status = store["Status"] || 'NO STORE';
      const city = store["City"] || '';
      const province = store["Province"] || '';
      const region = store["Region"] || '';

      locationsHtml += `
        <div class="radius-location-item">
          <div class="loc-item-header">
            <div class="loc-item-name">${name}</div>
            <div class="loc-item-dist">${formatDistance(store.distance)}</div>
          </div>
          <div class="loc-item-sub">${status} • ${city} • ${province} • ${region}</div>
        </div>
      `;
    });
  }

  panel.innerHTML = `
    <div class="radius-header">
      <div class="radius-title-box">
        <span style="font-size:16px;">✛</span> RADIUS
      </div>
      <div class="radius-count-badge">${totalInCity}</div>
    </div>

    <div class="radius-content">
      <div class="center-store-title">
        Radius center: <strong>${activeName}</strong>
        <div style="font-size:11px; color:#64748b; margin-top:2px;">
          Menampilkan toko di <b>${cityName || 'Kota ini'}</b> (${totalInCity} lokasi)
        </div>
      </div>

      <div class="radius-actions">
        <button id="btn-radius-clear" class="btn-radius-action">Clear</button>
        <button id="btn-radius-export" class="btn-radius-action">Export Matrix</button>
      </div>

      <div class="radius-locations-list">
        ${locationsHtml}
      </div>
    </div>

    <div class="radius-footer-accordion">
      <span>▼ BUSINESS UNITS - 2 KM</span>
    </div>
  `;

  panel.style.display = 'flex';

  document.getElementById('btn-radius-clear').addEventListener('click', () => {
    closeRightRadiusPanel();
  });

  document.getElementById('btn-radius-export').addEventListener('click', () => {
    alert('Exporting distance matrix data...');
  });
}

function closeRightRadiusPanel() {
  const panel = document.getElementById('right-info-panel');
  if (panel) {
    panel.style.display = 'none';
  }
  currentActiveStore = null;
  radiusCirclesGroup.clearLayers();
  connectionLinesGroup.clearLayers();
}