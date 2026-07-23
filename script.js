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

const selectedFilters = {
  partner: [],
  region: [],
  province: [],
  city: [],
  type: [],
  grade: [],
  status: []
};

// ==========================================
// 2. HELPER FUNCTIONS & ICONS
// ==========================================
const orangeIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="background-color: #EA580C; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const blueIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="background-color: #2563EB; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const greenIcon = L.divIcon({
  className: 'custom-icon',
  html: `<div style="background-color: #059669; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

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
  filteredStores = [...allStores];

  setupMultiSelects();
  updateDashboard();
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
      const label = document.createElement('label');
      label.className = 'multiselect-option';
      label.innerHTML = `
        <input type="checkbox" value="${optVal}">
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

  updateDashboard();
}

function resetFilters() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  filterConfigs.forEach(cfg => {
    selectedFilters[cfg.key] = [];
    const container = document.getElementById(cfg.id);
    if (container) {
      const btn = container.querySelector('.multiselect-btn');
      updateBtnLabel(btn, cfg.label, []);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = false);
    }
  });

  applyFilters();
}

// ==========================================
// 6. UPDATE DASHBOARD & COUNTERS
// ==========================================
function updateDashboard() {
  const existing = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'EXISTING').length;
  const progress = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'PROGRESS').length;
  const noStore = filteredStores.filter(s => String(s["Status"]).toUpperCase() === 'NO STORE').length;

  const totalStoresOnly = existing + progress;

  const statTotal = document.getElementById('stat-total');
  const statExisting = document.getElementById('stat-existing');
  const statProgress = document.getElementById('stat-progress');
  const statNoStore = document.getElementById('stat-nostore');
  const storesFound = document.getElementById('stores-found-text');

  if (statTotal) statTotal.textContent = totalStoresOnly;
  if (statExisting) statExisting.textContent = existing;
  if (statProgress) statProgress.textContent = progress;
  if (statNoStore) statNoStore.textContent = noStore;
  if (storesFound) storesFound.textContent = `${filteredStores.length} lokasi ditemukan`;

  renderStoreList();
  renderMarkers();
}

// ==========================================
// 7. RENDER STORE LIST CARDS (SISI KIRI - CITY POPULATION)
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
        map.flyTo([lat, lng], 14);
        drawRadiusCircles(lat, lng);
      }
    });

    listContainer.appendChild(card);
  });
}

// ==========================================
// 8. RENDER MARKERS (POPUP PETA - CITY POPULATION & TRAFFIC)
// ==========================================
function renderMarkers() {
  markersLayer.clearLayers();

  filteredStores.forEach(store => {
    const lat = parseNum(store["Latitude"]);
    const lng = parseNum(store["Longitude"]);

    if (isNaN(lat) || isNaN(lng)) return;

    const status = store["Status"];

    let icon = greenIcon;
    if (status === 'EXISTING') icon = orangeIcon;
    else if (status === 'PROGRESS') icon = blueIcon;

    const storeGrade = getGradeVal(store);
    const name = store["Store Name"] || store["Mall Name"] || store["Name"] || 'Xiaomi Store / Mall';
    const marker = L.marker([lat, lng], { icon: icon });

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
    marker.on('click', () => drawRadiusCircles(lat, lng));
    markersLayer.addLayer(marker);
  });
}

// ==========================================
// 9. DRAW RADIUS CIRCLES
// ==========================================
function drawRadiusCircles(lat, lng) {
  radiusCirclesGroup.clearLayers();

  const circle2k = L.circle([lat, lng], {
    color: '#EA580C',
    fillColor: '#EA580C',
    fillOpacity: 0.1,
    radius: 2000,
    dashArray: '4, 4'
  });

  const circle5k = L.circle([lat, lng], {
    color: '#2563EB',
    fillColor: '#2563EB',
    fillOpacity: 0.05,
    radius: 5000,
    dashArray: '6, 6'
  });

  radiusCirclesGroup.addLayer(circle2k);
  radiusCirclesGroup.addLayer(circle5k);
}