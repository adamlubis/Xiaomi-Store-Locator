let map;
let markerCluster;
let allStores = [];
let filteredStores = [];
let markersMap = new Map();

// Inisialisasi Peta
function initMap() {
  map = L.map('map').setView([-2.548926, 118.0148634], 5); // Center Indonesia

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markerCluster = L.markerClusterGroup();
  map.addLayer(markerCluster);
}

// Load Data Stores
async function loadStoresData() {
  const paths = [
    './output/stores.json',
    'output/stores.json',
    '../output/stores.json',
    'stores.json'
  ];

  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        allStores = await res.json();
        filteredStores = [...allStores];
        populateFilters();
        renderStores();
        return;
      }
    } catch (e) {
      console.warn(`Gagal memuat data dari ${path}`);
    }
  }
  console.error('Data stores.json tidak ditemukan!');
}

// Populate Dropdown Filters (Tanpa kata "Semua")
function populateFilters() {
  const filters = [
    { id: 'filter-partner', key: 'Partner' },
    { id: 'filter-region', key: 'Region' },
    { id: 'filter-province', key: 'Province' },
    { id: 'filter-city', key: 'City' },
    { id: 'filter-type', key: 'Type' },
    { id: 'filter-status', key: 'Status' }
  ];

  filters.forEach(f => {
    const select = document.getElementById(f.id);
    if (!select) return;

    // Ambil nilai unik dan urutkan
    const uniqueValues = [...new Set(allStores.map(s => s[f.key]).filter(Boolean))].sort();

    select.innerHTML = `<option value="">${f.key}</option>`;
    uniqueValues.forEach(val => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  });
}

// Filter Data
function filterStores() {
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  const partnerVal = document.getElementById('filter-partner').value;
  const regionVal = document.getElementById('filter-region').value;
  const provinceVal = document.getElementById('filter-province').value;
  const cityVal = document.getElementById('filter-city').value;
  const typeVal = document.getElementById('filter-type').value;
  const statusVal = document.getElementById('filter-status').value;

  filteredStores = allStores.filter(store => {
    const matchSearch = !searchVal || 
      (store['Store Name'] && store['Store Name'].toLowerCase().includes(searchVal)) ||
      (store['City'] && store['City'].toLowerCase().includes(searchVal)) ||
      (store['Partner'] && store['Partner'].toLowerCase().includes(searchVal)) ||
      (store['Address'] && store['Address'].toLowerCase().includes(searchVal));

    const matchPartner = !partnerVal || store['Partner'] === partnerVal;
    const matchRegion = !regionVal || store['Region'] === regionVal;
    const matchProvince = !provinceVal || store['Province'] === provinceVal;
    const matchCity = !cityVal || store['City'] === cityVal;
    const matchType = !typeVal || store['Type'] === typeVal;
    const matchStatus = !statusVal || store['Status'] === statusVal;

    return matchSearch && matchPartner && matchRegion && matchProvince && matchCity && matchType && matchStatus;
  });

  renderStores();
}

// Render Marker dan Sidebar List
function renderStores() {
  markerCluster.clearLayers();
  markersMap.clear();

  const storeListEl = document.getElementById('store-list');
  storeListEl.innerHTML = '';

  document.getElementById('store-count').textContent = `${filteredStores.length} toko ditemukan`;

  const bounds = [];

  filteredStores.forEach(store => {
    const lat = parseFloat(store.Latitude);
    const lng = parseFloat(store.Longitude);

    // Bikin Marker jika Lat Lng Valid
    if (!isNaN(lat) && !isNaN(lng)) {
      const marker = L.marker([lat, lng]);
      
      const popupContent = `
        <div class="popup-card">
          <span class="badge ${store.Status === 'Open' ? 'badge-open' : 'badge-closed'}">${store.Status || 'Active'}</span>
          <h3>${store['Store Name'] || 'Xiaomi Store'}</h3>
          <p><strong>Partner:</strong> ${store.Partner || '-'}</p>
          <p><strong>Region:</strong> ${store.Region || '-'}, ${store.City || '-'}</p>
          <p><strong>Alamat:</strong> ${store.Address || '-'}</p>
        </div>
      `;
      marker.bindPopup(popupContent);
      markerCluster.addLayer(marker);
      markersMap.set(store['Store Name'], marker);
      bounds.push([lat, lng]);
    }

    // Bikin Card Sidebar
    const card = document.createElement('div');
    card.className = 'store-card';
    card.innerHTML = `
      <div class="card-header">
        <h4>${store['Store Name']}</h4>
        <span class="badge ${store.Status === 'Open' ? 'badge-open' : 'badge-closed'}">${store.Status || 'Active'}</span>
      </div>
      <p class="store-partner"><strong>Partner:</strong> ${store.Partner || '-'}</p>
      <p class="store-location">📍 ${store.City || '-'}, ${store.Province || '-'}</p>
      <p class="store-address">${store.Address || '-'}</p>
    `;

    card.addEventListener('click', () => {
      if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng], 15);
        const marker = markersMap.get(store['Store Name']);
        if (marker) {
          markerCluster.zoomToShowLayer(marker, () => {
            marker.openPopup();
          });
        }
      }
    });

    storeListEl.appendChild(card);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

// Reset Filter
function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-partner').value = '';
  document.getElementById('filter-region').value = '';
  document.getElementById('filter-province').value = '';
  document.getElementById('filter-city').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-status').value = '';

  filteredStores = [...allStores];
  renderStores();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadStoresData();

  document.getElementById('search-input').addEventListener('input', filterStores);
  document.getElementById('filter-partner').addEventListener('change', filterStores);
  document.getElementById('filter-region').addEventListener('change', filterStores);
  document.getElementById('filter-province').addEventListener('change', filterStores);
  document.getElementById('filter-city').addEventListener('change', filterStores);
  document.getElementById('filter-type').addEventListener('change', filterStores);
  document.getElementById('filter-status').addEventListener('change', filterStores);
  document.getElementById('reset-btn').addEventListener('click', resetFilters);
});