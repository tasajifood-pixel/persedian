/* =====================================================
   PERSEDIAAN – TASAJI OMS
   (FAST UI: STATUS STOK + STATUS PO dari MATERIALIZED VIEW)
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

let page      = 1;
let pageSize  = 25;
let totalData = 0;

let currentSort   = "best"; // best | az | stock
let currentPeriod = "90d";  // 7d | 30d | 90d | 180d | 365d

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

// ✅ FORMAT HARI CAKUPAN (ANTI NaN / Infinity / minus)
function fmtHr(v){
  const n = Number(v);
  if (!isFinite(n) || isNaN(n) || n < 0) return "0.0 hr";
  return n.toFixed(1) + " hr";
}


// =====================
// LABEL & BADGE (UPDATED FOR MV VALUES)
// =====================

// status_stok dari MV: "Habis" | "Kritis" | "Menipis" | "Aman"
function stokLabel(s){
  if (s === "Habis")   return "Habis";
  if (s === "Kritis")  return "Kritis";
  if (s === "Menipis") return "Menipis";
  return "Aman";
}

// class CSS tetap pakai yang lama supaya UI tidak rusak
function stokClass(s){
  if (s === "Habis")   return "stok-habis";
  if (s === "Kritis")  return "stok-kritis";
  if (s === "Menipis") return "stok-menipis";
  return "stok-aman";
}

// status_po_baru dari MV: "PO_DARURAT" | "PO_SEGERA" | "PO_SIAGA" | "TAHAN_PO" | "TIDAK_PO"
function poLabel(s){
  if (s === "PO_DARURAT") return "PO Darurat";
  if (s === "PO_SEGERA")  return "PO Segera";
  if (s === "PO_SIAGA")   return "PO Siaga";
  if (s === "TAHAN_PO")   return "Tahan PO";
  return "Tidak PO";
}

function poClass(s){
  if (s === "PO_DARURAT") return "po_darurat";
  if (s === "PO_SEGERA")  return "po_segera";
  if (s === "PO_SIAGA")   return "po_siaga";
  if (s === "TAHAN_PO")   return "tahan_po";
  return "tidak_po";
}

// =====================
// SORT MAPPING (MV)
// =====================
function getRankColumnByPeriod(){
  if (currentPeriod === "7d")   return "rank_sold_7d";
  if (currentPeriod === "30d")  return "rank_sold_30d";
  if (currentPeriod === "180d") return "rank_sold_180d";
  if (currentPeriod === "365d") return "rank_sold_365d";
  return "rank_sold_90d"; // default
}

// =====================
// LOAD INVENTORY (FAST FROM MV)
// =====================
async function loadInventory(){
  if (!bodyEl) return;
  bodyEl.innerHTML = `Memuat data...`;


  const q = (searchEl.value || "").trim();
  const stokFilters = getCheckedValues(".chk-stok"); // "Habis"|"Kritis"|"Menipis"|"Aman" (pastikan value checkbox sama)
  const poFilters   = getCheckedValues(".chk-po");   // "PO_DARURAT" dll (pastikan value checkbox sama)

  // ---------- BUILD QUERY ----------
  // NOTE: gunakan MV di schema decision
  let query = sb
    .schema("decision")
    .from("mv_persediaan_fast")
    .select(
      "item_code,item_name,image_url,stok_tersedia_final,status_stok,status_po_baru,hari_cakupan_stok,rank_sold_7d,rank_sold_30d,rank_sold_90d,rank_sold_180d,rank_sold_365d",
      { count: "exact" }
    );

  // SEARCH (item_name OR item_code)
  if (q){
    // Supabase or syntax
    query = query.or(`item_name.ilike.%${q}%,item_code.ilike.%${q}%`);
  }

  // FILTER STATUS STOK
  if (stokFilters.length > 0){
    query = query.in("status_stok", stokFilters);
  }

  // FILTER STATUS PO
  if (poFilters.length > 0){
    query = query.in("status_po_baru", poFilters);
  }

  // SORT
  if (currentSort === "az"){
    query = query.order("item_name", { ascending: true });
  } else if (currentSort === "stock"){
    query = query.order("stok_tersedia_final", { ascending: false });
  } else {
    // best seller
    const rankCol = getRankColumnByPeriod();
    query = query.order(rankCol, { ascending: true });

  }

  // PAGINATION (server-side)
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  query = query.range(from, to);

  // ---------- EXECUTE ----------
  const { data, error, count } = await query;

  if (error){
    console.error("LOAD INVENTORY ERROR:", error);
    bodyEl.innerHTML = `Gagal memuat data`;
    return;
  }

  totalData = count ?? 0;
   // ✅ jika setelah filter/search total page mengecil dan page sekarang kebablasan
const totalPage = Math.max(1, Math.ceil(totalData / pageSize));
if (page > totalPage){
  page = totalPage;

  // re-run query dengan page yang benar
  await loadInventory();
  return;
}


  allData = (data || []).map(p => ({
    item_code   : p.item_code,
    item_name   : p.item_name,
    thumbnail   : p.image_url,
    qty         : Number(p.stok_tersedia_final || 0),
    status_stok : p.status_stok,          // "Habis"|"Kritis"|"Menipis"|"Aman"
    status_po   : p.status_po_baru,       // "PO_DARURAT" dll
    alasan      : null,                   // MV tidak bawa alasan_keputusan (kalau mau nanti kita tambahkan ke MV)
    hari        : p.hari_cakupan_stok,
  }));

  applyFilter();
}

// =====================
// FILTER + SORT
// =====================
function applyFilter(){
  // Karena filter & sort sudah dilakukan di backend MV, di frontend cukup render.
  filtered = allData;
  render();
}

// =====================
// RENDER
// =====================
function render(){
  const totalPage = Math.max(1, Math.ceil(totalData / pageSize));
  if (page > totalPage) page = totalPage;

  // ❗️JANGAN SLICE LAGI — DATA SUDAH SESUAI PAGE DARI BACKEND
  const rows = filtered;

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

  <div class="meta-row meta-top">
    <span class="badge ${stokClass(p.status_stok)}">
      ${stokLabel(p.status_stok)}
    </span>

    <span class="badge ${poClass(p.status_po)}">
      ${poLabel(p.status_po)}
    </span>
  </div>

  <div class="meta-row meta-bottom">
    <span class="product-stock">
      S: ${p.qty}
    </span>

    <span class="product-days-pill">
      ${fmtHr(p.hari)}
    </span>
  </div>

</div>


    <!-- COL 2: STOK (DESKTOP) -->
    <div class="stock-cell">
      <span class="product-stock desktop-stock">
        ${p.qty}
      </span>
      <div class="product-days desktop-days">
        ${fmtHr(p.hari).replace("hr","hari")}
      </div>
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

    badge.onclick = async ()=>{
      chk.checked = !chk.checked;
      page = 1;
      await loadInventory();
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
    const next = Number(p.dataset.p);
    if (!isNaN(next) && next >= 1){
      page = next;
      await loadInventory();
    }
    return;
  }

  const s = e.target.closest(".inv-sort-btn");
  if (s){
    sortBtns.forEach(b=>b.classList.remove("active"));
    s.classList.add("active");

    currentSort = s.dataset.sort; // best|az|stock
    periodBox.style.display = currentSort === "best" ? "flex" : "none";

    page = 1;
    await loadInventory();
    return;
  }

  const per = e.target.closest(".inv-period-btn");
  if (per){
    periodBtns.forEach(b=>b.classList.remove("active"));
    per.classList.add("active");

    currentPeriod = per.dataset.period; // 7d|30d|90d|180d|365d

    page = 1;
    await loadInventory();
    return;
  }
});

pageSizeEl.onchange = async ()=>{
  pageSize = Number(pageSizeEl.value);
  page = 1;
  await loadInventory();
};

searchEl.oninput = async ()=>{
  page = 1;
  await loadInventory();
};

document.querySelectorAll(".chk-stok, .chk-po").forEach(el=>{
  el.onchange = async ()=>{
    page = 1;
    await loadInventory();
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
