// Inisialisasi Peta
const map = L.map('map').setView([-2.548926, 118.014863], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

let allStores = [];
let filteredStores = [];
let markersLayer = L.layerGroup().addTo(map);
let radiusCirclesGroup = L.layerGroup().addTo(map);

// Marker Icons
const orangeIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="background-color: #ff6b00; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const blueIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="background-color: #0078ff; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val.replace(',', '.').trim());
  return NaN;
}

// Load Data
async function loadStoresData() {
  const paths = ['../output/stores.json', './output/stores.json', '/output/stores.json'];
  let data = null;

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (e) {}
  }

  if (data && Array.isArray(data)) {
    allStores = data;
    filteredStores = [...allStores];
    populateFilters();
    updateDashboard();
  } else {
    alert("Gagal membaca stores.json. Pastikan Live Server berjalan dan JSON valid.");
  }
}

loadStoresData();

// Populate Select Filters
function populateFilters() {
  const filterKeys = [
    { id: 'filter-partner', key: 'Partner' },
    { id: 'filter-region', key: 'Region' },
    { id: 'filter-province', key: 'Province' },
    { id: 'filter-city', key: 'City' },
    { id: 'filter-type', key: 'Type' },
    { id: 'filter-status', key: 'Status' }
  ];

  filterKeys.forEach(f => {
    const select = document.getElementById(f.id);
    const unique = [...new Set(allStores.map(item => item[f.key]).filter(Boolean))].sort();

    select.innerHTML = `<option value="">Semua ${f.key}</option>`;
    unique.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });

    select.addEventListener('change', applyFilters);
  });

  document.getElementById('search-input').addEventListener('input', applyFilters);
}

// Filter Logic
function applyFilters() {
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  const partnerVal = document.getElementById('filter-partner').value;
  const regionVal = document.getElementById('filter-region').value;
  const provinceVal = document.getElementById('filter-province').value;
  const cityVal = document.getElementById('filter-city').value;
  const typeVal = document.getElementById('filter-type').value;
  const statusVal = document.getElementById('filter-status').value;

  filteredStores = allStores.filter(store => {
    const matchSearch = !searchVal || 
      (store["Store Name"] || '').toLowerCase().includes(searchVal) ||
      (store["Partner"] || '').toLowerCase().includes(searchVal) ||
      (store["City"] || '').toLowerCase().includes(searchVal);

    return matchSearch &&
           (partnerVal === '' || store["Partner"] === partnerVal) &&
           (regionVal === '' || store["Region"] === regionVal) &&
           (provinceVal === '' || store["Province"] === provinceVal) &&
           (cityVal === '' || store["City"] === cityVal) &&
           (typeVal === '' || store["Type"] === typeVal) &&
           (statusVal === '' || store["Status"] === statusVal);
  });

  updateDashboard();
}

function resetFilters() {
  document.getElementById('search-input').value = '';
  ['filter-partner', 'filter-region', 'filter-province', 'filter-city', 'filter-type', 'filter-status'].forEach(id => {
    document.getElementById(id).value = '';
  });
  applyFilters();
}

// Update UI (KPI, List, Markers)
function updateDashboard() {
  const total = filteredStores.length;
  const existing = filteredStores.filter(s => (s["Status"]||'').toLowerCase() === 'existing').length;
  const progress = filteredStores.filter(s => (s["Status"]||'').toLowerCase() === 'progress').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-existing').textContent = existing;
  document.getElementById('stat-progress').textContent = progress;
  document.getElementById('stores-found-text').textContent = `${total} toko ditemukan`;

  renderStoreList();
  renderMarkers();
}

// Render Sidebar Cards
function renderStoreList() {
  const listContainer = document.getElementById('store-list');
  listContainer.innerHTML = '';

  filteredStores.forEach(store => {
    const isExisting = (store["Status"] || '').toLowerCase() === 'existing';
    const badgeClass = isExisting ? 'badge-existing' : 'badge-progress';
    
    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title">${store["Store Name"] || 'Xiaomi Store'}</div>
        <span class="badge ${badgeClass}">${store["Status"] || 'N/A'}</span>
      </div>
      <div class="card-partner">🏢 ${store["Partner"] || '-'}</div>
      <div class="card-address">📍 ${store["City"] || ''}, ${store["Province"] || ''}</div>
    `;

    card.addEventListener('click', () => {
      const lat = parseNum(store["Latitude"]);
      const lng = parseNum(store["Longitude"]);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 14);
        drawRadiusCircles(lat, lng);
      }
    });

    listContainer.appendChild(card);
  });
}

// Render Markers & Popup
function renderMarkers() {
  markersLayer.clearLayers();

  filteredStores.forEach(store => {
    const lat = parseNum(store["Latitude"]);
    const lng = parseNum(store["Longitude"]);

    if (isNaN(lat) || isNaN(lng)) return;

    const status = (store["Status"] || '').toLowerCase();
    const icon = status === 'existing' ? orangeIcon : blueIcon;

    const marker = L.marker([lat, lng], { icon: icon });

    const rawCost = parseNum(store["Rental Cost"]);
    const rentalCost = !isNaN(rawCost) ? `Rp ${new Intl.NumberFormat('id-ID').format(rawCost)}` : '-';

    const popupContent = `
      <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">${store["Store Name"]}</div>
      <div style="font-size:11px; color:#666; margin-bottom:8px;">${store["Address"] || ''}</div>
      <div style="font-size:11px; line-height:1.5;">
        <b>Partner:</b> ${store["Partner"] || '-'}<br>
        <b>Region:</b> ${store["Region"] || '-'}<br>
        <b>Status:</b> ${store["Status"] || '-'}<br>
        <b>Size:</b> ${store["Store Size"] || '-'} sqm<br>
        <b>Rental:</b> ${rentalCost}
      </div>
    `;

    marker.bindPopup(popupContent);

    marker.on('click', () => {
      drawRadiusCircles(lat, lng);
    });

    markersLayer.addLayer(marker);
  });
}

// Draw Radius Circles (2 KM & 5 KM)
function drawRadiusCircles(lat, lng) {
  radiusCirclesGroup.clearLayers();

  const circle2k = L.circle([lat, lng], {
    color: '#ff6b00',
    fillColor: '#ff6b00',
    fillOpacity: 0.1,
    radius: 2000,
    dashArray: '4, 4'
  });

  const circle5k = L.circle([lat, lng], {
    color: '#0078ff',
    fillColor: '#0078ff',
    fillOpacity: 0.05,
    radius: 5000,
    dashArray: '6, 6'
  });

  radiusCirclesGroup.addLayer(circle2k);
  radiusCirclesGroup.addLayer(circle5k);
}