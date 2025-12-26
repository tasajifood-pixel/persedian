/* =====================================================
   PERSEDIAAN – TASAJI OMS
   (ENTERPRISE: STATUS STOK + STATUS PO dari SUPABASE VIEW)
===================================================== */

// =====================
// SUPABASE INIT
// =====================
const sb = supabase.createClient(
  "https://fpjfdxpdaqtopjorqood.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwamZkeHBkYXF0b3Bqb3Jxb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NjU2NDUsImV4cCI6MjA3NjU0MTY0NX0.7cSIF32p9SHaHHlUcMFrrQSq7JBOdP4LneEvcMRrtXU"
);

// =====================
// DOM
// =====================
const bodyEl       = document.getElementById("inventoryBody");
const paginationEl = document.getElementById("pagination");
const pageSizeEl   = document.getElementById("pageSize");

const searchEl = document.getElementById("filterSearch");
const btnApply = document.getElementById("btnApply");

const sortBtns   = document.querySelectorAll(".inv-sort-btn");
const periodBtns = document.querySelectorAll(".inv-period-btn");
const periodBox  = document.getElementById("invBestPeriodBox");

// =====================
// STATE
// =====================
let allData  = [];
let filtered = [];

let bestRank = {};

let page     = 1;
let pageSize = 25;
let totalData = 0;

let currentSort   = "best";
let currentPeriod = "365d";

// =====================
// HELPERS
// =====================
function norm(v){
  return (v || "").toString().trim().toLowerCase();
}

function getCheckedValues(selector){
  return Array.from(document.querySelectorAll(selector + ":checked"))
    .map(el => el.value);
}

// =====================
// LABEL & BADGE
// =====================
function stokLabel(s){
  if (s === "habis") return "Habis";
  if (s === "kritis") return "Kritis";
  if (s === "menipis") return "Menipis";
  if (s === "aman_data_baru") return "Aman (Data Baru)";
  return "Aman";
}

function stokClass(s){
  if (s === "habis") return "stok-habis";
  if (s === "kritis") return "stok-kritis";
  if (s === "menipis") return "stok-menipis";
  if (s === "aman_data_baru") return "stok-aman_data_baru";
  return "stok-aman";
}

function poLabel(s){
  if (s === "po_darurat") return "PO Darurat";
  if (s === "po_segera")  return "PO Segera";
  if (s === "po_siaga")   return "PO Siaga";
  if (s === "tahan_po")   return "Tahan PO";
  return "Tidak PO";
}

function poClass(s){
  if (s === "po_darurat") return "po_darurat";
  if (s === "po_segera")  return "po_segera";
  if (s === "po_siaga")   return "po_siaga";
  if (s === "tahan_po")   return "tahan_po";
  return "tidak_po";
}

// =====================
// LOAD BEST SELLER
// =====================

// =====================
// LOAD INVENTORY
// =====================
async function loadInventory(){
  bodyEl.innerHTML = `Memuat data...`;

  const q = (searchEl.value || "").trim();
  const stokFilters = getCheckedValues(".chk-stok").map(v => v.toLowerCase());
  const poFilters   = getCheckedValues(".chk-po");

  const { data, error } = await sb.rpc("rpc_mpi_inventory", {
    p_limit      : pageSize,
    p_offset     : (page - 1) * pageSize,
    p_sort       : currentSort,      // 'best'
    p_period_key : currentPeriod,    // '90d'
    p_q          : q || null,
    p_po         : poFilters.length ? poFilters : null,
    p_stok       : stokFilters.length ? stokFilters : null
  });

  if (error){
    console.error("LOAD INVENTORY ERROR:", error);
    bodyEl.innerHTML = `Gagal memuat data`;
    return;
  }

  totalData = data?.[0]?.total_rows ?? 0;

  allData = (data || []).map(p => ({
    item_code   : p.item_code,
    item_name   : p.item_name,
    thumbnail   : p.image_url,
    qty         : Number(p.stok_tersedia_final || 0),
    status_stok : p.status_stok,          // ⬅️ dari backend
    status_po   : norm(p.status_po_baru),
    alasan      : p.alasan_keputusan,
    hari        : p.hari_cakupan_stok,
    best_rank   : p.best_rank              // opsional, buat debug
  }));

  console.log("DEBUG allData.length =", allData.length);
  console.log("DEBUG totalData =", totalData);
  console.log("DEBUG first row =", allData[0]);

  applyFilter();
}


  applyFilter();
}


// =====================
// FILTER + SORT
// =====================
function applyFilter(){
  const q = (searchEl.value || "").toLowerCase();

  const stokFilters = getCheckedValues(".chk-stok").map(v=>v.toLowerCase());
  const poFilters   = getCheckedValues(".chk-po");

  let temp = allData.filter(p=>{
    if (q && !(p.item_name.toLowerCase().includes(q) || p.item_code.toLowerCase().includes(q))) return false;
    if (stokFilters.length && !stokFilters.includes(p.status_stok)) return false;
    if (poFilters.length && !poFilters.includes(p.status_po)) return false;
    return true;
  });

 if (currentSort === "best"){
  const ranked = [];
  const rest   = [];

  temp.forEach(p=>{
    if (bestRank[norm(p.item_code)] !== undefined) {
      ranked.push(p);
    } else {
      rest.push(p);
    }
  });

  ranked.sort(
    (a,b)=> bestRank[norm(a.item_code)] - bestRank[norm(b.item_code)]
  );

  // sisanya bebas, biar rapi pakai stok desc
  rest.sort((a,b)=> b.qty - a.qty);

  filtered = [...ranked, ...rest];
}


  render();
}

// =====================
// RENDER
// =====================
function render(){
 const totalPage = Math.max(1, Math.ceil(totalData / pageSize));
  if (page > totalPage) page = totalPage;

  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  bodyEl.innerHTML = rows.map(p => `
  <div class="inventory-row">

    <!-- COL 1: PRODUK -->
    <div class="product-cell">
      <div class="product-thumb">
        ${p.thumbnail ? `<img src="${p.thumbnail}">` : ""}
      </div>

      <div class="product-info">
        <div class="product-name">${p.item_name}</div>
        <div class="product-sku">${p.item_code}</div>

        <!-- MOBILE ONLY: meta (tetap seperti sebelumnya) -->
        <div class="product-meta mobile-meta">
          <span class="badge ${stokClass(p.status_stok)}">
            ${stokLabel(p.status_stok)}
          </span>

          <span class="badge ${poClass(p.status_po)}">
            ${poLabel(p.status_po)}
          </span>

          <span class="product-stock">
            ${p.qty}
          </span>
        </div>
      </div>
    </div>

    <!-- COL 2: STOK (DESKTOP) -->
    <div class="stock-cell">
      <span class="product-stock desktop-stock">
        ${p.qty}
      </span>
    </div>

    <!-- COL 3: STATUS STOK (DESKTOP) -->
    <div class="status-stok-cell">
      <span class="badge ${stokClass(p.status_stok)}">
        ${stokLabel(p.status_stok)}
      </span>
    </div>

    <!-- COL 4: STATUS PO (DESKTOP) -->
    <div class="status-po-cell">
      <span class="badge ${poClass(p.status_po)}">
        ${poLabel(p.status_po)}
      </span>
    </div>

  </div>
`).join("");


  renderPagination(totalPage);
}

// =====================
// PAGINATION
// =====================
function renderPagination(total){
  let html = `<button class="page-btn" data-p="${page-1}" ${page===1?"disabled":""}>‹</button>`;
  for(let i=1;i<=total;i++){
    if (i>5 && i<total-1){ if(i===6) html+=`<span class="page-ellipsis">…</span>`; continue; }
    html += `<button class="page-btn ${i===page?"active":""}" data-p="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-p="${page+1}" ${page===total?"disabled":""}>›</button>`;
  paginationEl.innerHTML = html;
}

// =====================
// PO SLOT
// =====================
function renderPoSlot(){
  const slot = document.getElementById("invPoSlot");
  if (!slot) return;

  const poChecks = document.querySelectorAll(".chk-po");
  slot.innerHTML = "";

  poChecks.forEach(chk=>{
    const label = chk.closest(".check-row");
    if (!label) return;

    const badge = document.createElement("span");
    badge.className = `badge ${poClass(chk.value)}`;
    badge.textContent = label.querySelector("span")?.textContent || chk.value;

    if (chk.checked) badge.classList.add("active");

    badge.onclick = ()=>{
      chk.checked = !chk.checked;
      applyFilter();
      renderPoSlot();
    };

    slot.appendChild(badge);
  });
}

// =====================
// EVENTS
// =====================
document.addEventListener("click", async e=>{
  const p = e.target.closest(".page-btn");
 if (p){
  page = Number(p.dataset.p);
  await loadInventory();
  return;
}


  const s = e.target.closest(".inv-sort-btn");
  if (s){
    sortBtns.forEach(b=>b.classList.remove("active"));
    s.classList.add("active");

    currentSort = s.dataset.sort;
    periodBox.style.display = currentSort === "best" ? "flex" : "none";

    if (currentSort === "best") await loadBestSeller();
    applyFilter();
  }

  const per = e.target.closest(".inv-period-btn");
  if (per){
    periodBtns.forEach(b=>b.classList.remove("active"));
    per.classList.add("active");

    currentPeriod = per.dataset.period;
    await loadBestSeller();
    applyFilter();
  }
});

pageSizeEl.onchange = async ()=>{
  pageSize = Number(pageSizeEl.value);
  page = 1;
  await loadInventory();
};


searchEl.oninput = applyFilter;

document.querySelectorAll(".chk-stok, .chk-po").forEach(el=>{
  el.onchange = ()=>{
    applyFilter();
    renderPoSlot();
  };
});

if (btnApply) btnApply.onclick = null;

// =====================
// INIT
// =====================
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadInventory();
  renderPoSlot();
});
