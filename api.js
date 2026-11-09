/* =====================================================================
   SENTRA HUB – api.js  (dipakai bersama oleh index.html & form.html)
   ---------------------------------------------------------------------
   1) Tempel URL Web App Google Apps Script (berakhiran /exec) di GAS_URL.
   2) Selama GAS_URL kosong, website berjalan di MODE DEMO
      (data dummy + data input disimpan di localStorage browser).
   ===================================================================== */
(function () {
  "use strict";

  const CONFIG = {
    GAS_URL: "https://script.google.com/macros/s/AKfycbwu40bb42I-srv_B3TwcOw8oOt7LlTKNIIDEev3XUO3emQsO9KV-iADWQj8BaiBgp4/exec" // contoh: "https://script.google.com/macros/s/AKfycb.../exec"
  };

  // Kota-kota besar yang tampil di peta (field "kota" pada form menentukan titiknya)
  const CITIES = [
    { name: "Jakarta", lat: -6.2088, lng: 106.8456 },
    { name: "Bandung", lat: -6.9175, lng: 107.6191 },
    { name: "Semarang", lat: -6.9667, lng: 110.4203 },
    { name: "Yogyakarta", lat: -7.7956, lng: 110.3695 },
    { name: "Surabaya", lat: -7.2575, lng: 112.7521 },
    { name: "Malang", lat: -7.9666, lng: 112.6326 },
    { name: "Denpasar", lat: -8.6705, lng: 115.2126 },
    { name: "Medan", lat: 3.5952, lng: 98.6722 },
    { name: "Pekanbaru", lat: 0.5071, lng: 101.4478 },
    { name: "Padang", lat: -0.9471, lng: 100.4172 },
    { name: "Batam", lat: 1.0456, lng: 104.0305 },
    { name: "Palembang", lat: -2.9761, lng: 104.7754 },
    { name: "Bandar Lampung", lat: -5.4294, lng: 105.2610 },
    { name: "Pontianak", lat: -0.0263, lng: 109.3425 },
    { name: "Banjarmasin", lat: -3.3194, lng: 114.5908 },
    { name: "Balikpapan", lat: -1.2379, lng: 116.8529 },
    { name: "Makassar", lat: -5.1477, lng: 119.4327 },
    { name: "Manado", lat: 1.4748, lng: 124.8421 },
    { name: "Jayapura", lat: -2.5337, lng: 140.7181 }
  ];

  // ---- Data dummy (kelolaan dalam MILIAR rupiah; personil = [driver, custody restock, custody FLM, custody driver, admin, manager, asmen]; infra = [mesin hitung, mesin sortir, mobil CR FLM])
  const SEED = /*SEED_START*/[
{"nama":"COU Jakarta Pusat","divisi":"Opr 1","region":1,"kota":"Jakarta","banks":[["BCA","CR & FLM",120],["Mandiri","CIT",95],["BNI","SLM",60],["BRI","CR & FLM",80],["CIMB Niaga","CIT",40]],"personil":[28,14,8,6,5,3,2],"infra":[22,12,26]},
{"nama":"COU Jakarta Selatan","divisi":"Opr 1","region":1,"kota":"Jakarta","banks":[["BCA","CIT",70],["Permata","CR & FLM",35],["Danamon","SLM",28],["OCBC","CR & FLM",30]],"personil":[18,9,5,4,3,2,1],"infra":[14,8,17]},
{"nama":"COU Bandung","divisi":"Opr 1","region":2,"kota":"Bandung","banks":[["Mandiri","CR & FLM",55],["BRI","CIT",48],["BNI","CR & FLM",40],["BTN","SLM",22]],"personil":[16,8,4,4,3,2,1],"infra":[10,6,13]},
{"nama":"COU Semarang","divisi":"Opr 2","region":3,"kota":"Semarang","banks":[["BCA","CR & FLM",50],["BRI","CR & FLM",62],["Mandiri","SLM",33],["Panin","CIT",18]],"personil":[14,7,4,3,3,2,1],"infra":[9,5,11]},
{"nama":"COU Surabaya","divisi":"Opr 2","region":4,"kota":"Surabaya","banks":[["BCA","CR & FLM",90],["Mandiri","CIT",75],["BNI","CR & FLM",58],["BRI","SLM",44],["Maybank","CIT",26]],"personil":[24,12,7,5,4,3,2],"infra":[19,11,22]},
{"nama":"COU Medan","divisi":"Opr 2","region":5,"kota":"Medan","banks":[["BRI","CR & FLM",68],["Mandiri","CR & FLM",52],["BCA","CIT",46],["BNI","SLM",31]],"personil":[17,9,5,4,3,2,1],"infra":[11,7,14]},
{"nama":"COU Makassar","divisi":"Opr 2","region":6,"kota":"Makassar","banks":[["BRI","CR & FLM",57],["Mandiri","CIT",41],["BNI","CR & FLM",36],["BSI","SLM",24]],"personil":[13,7,4,3,2,2,1],"infra":[9,5,10]},
{"nama":"COU Denpasar","divisi":"Opr 1","region":7,"kota":"Denpasar","banks":[["BCA","CR & FLM",44],["Mandiri","CR & FLM",38],["BNI","CIT",27],["Danamon","SLM",16]],"personil":[9,5,3,2,2,1,1],"infra":[6,4,8]},
{"nama":"COU Palembang","divisi":"Opr 2","region":8,"kota":"Palembang","banks":[["BRI","CR & FLM",49],["Mandiri","SLM",34],["BCA","CIT",29],["BNI","CR & FLM",25]],"personil":[11,6,3,3,2,1,1],"infra":[7,4,9]},
{"nama":"COU Balikpapan","divisi":"Opr 1","region":9,"kota":"Balikpapan","banks":[["Mandiri","CR & FLM",43],["BRI","CIT",35],["BCA","CR & FLM",32],["BNI","SLM",19]],"personil":[10,5,3,2,2,1,1],"infra":[7,4,9]},
{"nama":"COU Pontianak","divisi":"Opr 2","region":10,"kota":"Pontianak","banks":[["BRI","CR & FLM",37],["Mandiri","CIT",28],["BNI","SLM",17]],"personil":[8,4,2,2,2,1,1],"infra":[5,3,7]},
{"nama":"COU Manado","divisi":"Opr 1","region":10,"kota":"Manado","banks":[["BRI","CR & FLM",33],["Mandiri","CR & FLM",29],["BCA","CIT",21]],"personil":[7,4,2,2,1,1,1],"infra":[5,3,6]}
]/*SEED_END*/;

  // ---------- util ----------
  const nf = (d) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d });
  const fmtNum = (n) => nf(0).format(Math.round(Number(n) || 0));
  function fmtRp(n, long) {
    n = Number(n) || 0;
    const a = Math.abs(n);
    if (a >= 1e12) return "Rp " + nf(2).format(n / 1e12) + (long ? " Triliun" : " T");
    if (a >= 1e9) return "Rp " + nf(1).format(n / 1e9) + (long ? " Miliar" : " M");
    if (a >= 1e6) return "Rp " + nf(1).format(n / 1e6) + (long ? " Juta" : " Jt");
    return "Rp " + nf(0).format(n);
  }
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

  function toast(msg, type) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".4s"; setTimeout(() => t.remove(), 400); }, 4600);
  }

  // ---------- data dummy -> bentuk "raw" seperti isi spreadsheet ----------
  function seedRaw() {
    const raw = { sentra: [], kelolaan: [], personil: [], infrastruktur: [] };
    SEED.forEach((s, i) => {
      const id = "S" + String(i + 1).padStart(2, "0");
      raw.sentra.push({ id, nama_sentra: s.nama, divisi: s.divisi, region: s.region, kota: s.kota });
      s.banks.forEach((b) => raw.kelolaan.push({ id_sentra: id, nama_sentra: s.nama, nama_bank: b[0], bisnis: b[1], jumlah_kelolaan: b[2] * 1e9 }));
      const p = s.personil;
      raw.personil.push({ id_sentra: id, nama_sentra: s.nama, driver: p[0], custody_restock: p[1], custody_flm: p[2], custody_driver: p[3], admin: p[4], manager: p[5], asmen: p[6] });
      raw.infrastruktur.push({ id_sentra: id, nama_sentra: s.nama, mesin_hitung: s.infra[0], mesin_sortir: s.infra[1], mobil_cr_flm: s.infra[2] });
    });
    return raw;
  }

  const LS_KEY = "sentra_hub_demo_v1";
  function demoLoad() {
    try { const j = JSON.parse(localStorage.getItem(LS_KEY)); if (j && j.sentra) return j; } catch (e) {}
    return seedRaw();
  }
  function demoSave(raw) { try { localStorage.setItem(LS_KEY, JSON.stringify(raw)); } catch (e) {} }
  function demoSubmit(p) {
    const raw = demoLoad();
    const nm = String(p.sentra.nama_sentra).trim();
    let s = raw.sentra.find((x) => String(x.nama_sentra).trim().toLowerCase() === nm.toLowerCase());
    if (s) { Object.assign(s, { nama_sentra: nm, divisi: p.sentra.divisi, region: p.sentra.region, kota: p.sentra.kota }); }
    else {
      const max = raw.sentra.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ""), 10) || 0), 0);
      s = { id: "S" + String(max + 1).padStart(2, "0"), nama_sentra: nm, divisi: p.sentra.divisi, region: p.sentra.region, kota: p.sentra.kota };
      raw.sentra.push(s);
    }
    const id = s.id;
    ["kelolaan", "personil", "infrastruktur"].forEach((k) => (raw[k] = raw[k].filter((r) => r.id_sentra !== id)));
    p.kelolaan.forEach((r) => raw.kelolaan.push({ id_sentra: id, nama_sentra: nm, ...r }));
    raw.personil.push({ id_sentra: id, nama_sentra: nm, ...p.personil });
    raw.infrastruktur.push({ id_sentra: id, nama_sentra: nm, ...p.infrastruktur });
    demoSave(raw);
    return { ok: true, id };
  }

  // ---------- koneksi Google Apps Script ----------
  async function loadData() {
    if (!CONFIG.GAS_URL) return { raw: demoLoad(), demo: true };
    const url = CONFIG.GAS_URL + (CONFIG.GAS_URL.includes("?") ? "&" : "?") + "action=all&_=" + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Gagal memuat data");
    return { raw: j, demo: false };
  }

  async function submitData(payload) {
    payload.action = "submit";
    if (!CONFIG.GAS_URL) return { ...demoSubmit(payload), demo: true };
    // Tanpa header Content-Type => "simple request" (text/plain) => tidak ada preflight CORS.
    const res = await fetch(CONFIG.GAS_URL, { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Gagal menyimpan");
    return { ...j, demo: false };
  }

  // ---------- agregasi ----------
  function aggregate(raw) {
    const group = (arr, key) => (arr || []).reduce((m, r) => { (m[r[key]] = m[r[key]] || []).push(r); return m; }, {});
    const kel = group(raw.kelolaan, "id_sentra"), per = group(raw.personil, "id_sentra"), inf = group(raw.infrastruktur, "id_sentra");
    const allBanks = new Set();
    let relasi = 0;

    const sentras = (raw.sentra || []).map((s) => {
      const k = kel[s.id] || [], p = (per[s.id] || [])[0] || {}, i = (inf[s.id] || [])[0] || {};
      const bankSet = new Map();
      const byBisnis = {};
      let kelolaan = 0;
      k.forEach((r) => {
        const key = String(r.nama_bank).trim().toLowerCase();
        if (!bankSet.has(key)) bankSet.set(key, String(r.nama_bank).trim());
        allBanks.add(key);
        kelolaan += num(r.jumlah_kelolaan);
        byBisnis[r.bisnis] = (byBisnis[r.bisnis] || 0) + num(r.jumlah_kelolaan);
      });
      relasi += bankSet.size;
      const pers = {
        driver: num(p.driver), custody_restock: num(p.custody_restock), custody_flm: num(p.custody_flm),
        custody_driver: num(p.custody_driver), admin: num(p.admin), manager: num(p.manager), asmen: num(p.asmen)
      };
      const pegawai = Object.values(pers).reduce((a, b) => a + b, 0);
      return {
        id: s.id, nama: s.nama_sentra, divisi: s.divisi, region: Number(s.region), kota: s.kota || "",
        banks: bankSet.size, bankList: [...bankSet.values()], kelolaan, byBisnis, pers, pegawai,
        rasio: pegawai ? kelolaan / pegawai : 0,
        mesinHitung: num(i.mesin_hitung), mesinSortir: num(i.mesin_sortir), mobil: num(i.mobil_cr_flm)
      };
    });

    const sum = (f) => sentras.reduce((a, s) => a + f(s), 0);
    const byDivisi = { "Opr 1": 0, "Opr 2": 0 };
    const byRegion = {}; for (let r = 1; r <= 10; r++) byRegion[r] = 0;
    sentras.forEach((s) => {
      byDivisi[s.divisi] = (byDivisi[s.divisi] || 0) + s.kelolaan;
      byRegion[s.region] = (byRegion[s.region] || 0) + s.kelolaan;
    });
    const totals = {
      banks: allBanks.size, relasi, sentra: sentras.length, kelolaan: sum((s) => s.kelolaan), pegawai: sum((s) => s.pegawai),
      mesinHitung: sum((s) => s.mesinHitung), mesinSortir: sum((s) => s.mesinSortir), mobil: sum((s) => s.mobil)
    };
    const byCou = [...sentras].sort((a, b) => b.kelolaan - a.kelolaan);
    return { sentras, totals, byDivisi, byRegion, byCou };
  }

  // ---------- ikon (inline SVG sprite, gaya outline) ----------
  const ICONS = {
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V6M17 16v-3"/>',
    plus: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bank: '<path d="M3 21h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M12 3 3 8h18l-9-5Z"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
    truck: '<path d="M1 6h13v11H1zM14 9h4.5L22 12.5V17h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    calc: '<rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h.01M16 18.5h.01"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    scale: '<path d="M12 3v18M6 21h12M5 7h14"/><path d="M5 7 2.5 14a3 3 0 0 0 5 0L5 7ZM19 7l-2.5 7a3 3 0 0 0 5 0L19 7Z"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
    save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'
  };
  function mountSprite() {
    if (document.getElementById("sentra-sprite")) return;
    const s = '<svg id="sentra-sprite" width="0" height="0" style="position:absolute" aria-hidden="true">' +
      Object.keys(ICONS).map((k) => `<symbol id="i-${k}" viewBox="0 0 24 24">${ICONS[k]}</symbol>`).join("") + "</svg>";
    document.body.insertAdjacentHTML("afterbegin", s);
  }
  if (document.body) mountSprite(); else document.addEventListener("DOMContentLoaded", mountSprite);
  const icon = (n, c) => `<svg class="ic ${c || ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  // ---------- ilustrasi hero: kepulauan titik-titik + jaringan sentra ----------
  function heroArt() {
    const nodes = [[62, 72], [150, 178], [332, 128], [336, 237], [388, 186], [606, 134]];
    return `<svg viewBox="0 0 640 330" class="art" role="img" aria-label="Ilustrasi jaringan sentra di kepulauan Indonesia">
  <defs>
    <pattern id="hdots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,.7)"/></pattern>
    <radialGradient id="hglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <linearGradient id="harc" x1="0" x2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#8fb0ff"/></linearGradient>
    <g id="hisl">
      <ellipse cx="112" cy="140" rx="100" ry="21" transform="rotate(40 112 140)"/>
      <ellipse cx="292" cy="240" rx="78" ry="9" transform="rotate(-4 292 240)"/>
      <ellipse cx="392" cy="251" rx="34" ry="7"/>
      <ellipse cx="300" cy="122" rx="64" ry="56"/>
      <ellipse cx="398" cy="152" rx="11" ry="44" transform="rotate(14 398 152)"/>
      <ellipse cx="420" cy="116" rx="24" ry="9"/>
      <ellipse cx="470" cy="140" rx="13" ry="20"/>
      <ellipse cx="555" cy="160" rx="80" ry="38" transform="rotate(-12 555 160)"/>
    </g>
  </defs>
  <circle cx="330" cy="165" r="150" fill="none" stroke="rgba(255,255,255,.08)"/>
  <circle cx="330" cy="165" r="110" fill="none" stroke="rgba(255,255,255,.06)"/>
  <use href="#hisl" fill="rgba(255,255,255,.10)"/>
  <use href="#hisl" fill="url(#hdots)"/>
  <g fill="none" stroke="url(#harc)" stroke-width="1.6" stroke-dasharray="4 6" stroke-linecap="round">
    <path class="flow" d="M222 240 Q120 120 62 72"/>
    <path class="flow" d="M222 240 Q175 215 150 178"/>
    <path class="flow" d="M222 240 Q280 262 336 237"/>
    <path class="flow" d="M222 240 Q250 150 332 128"/>
    <path class="flow" d="M336 237 Q380 240 388 186"/>
    <path class="flow" d="M336 237 Q480 60 606 134"/>
  </g>
  <g>
    <circle cx="222" cy="240" r="22" fill="url(#hglow)"/>
    <circle class="node-ring" cx="222" cy="240" r="8" fill="none" stroke="#ffd27a" stroke-width="2"/>
    <circle cx="222" cy="240" r="8" fill="#ffd27a" stroke="#fff" stroke-width="2.5"/>
    ${nodes.map((n, i) => `<circle cx="${n[0]}" cy="${n[1]}" r="15" fill="url(#hglow)" opacity=".7"/><circle class="node-ring" style="animation-delay:${(i * 0.45).toFixed(2)}s" cx="${n[0]}" cy="${n[1]}" r="5" fill="none" stroke="#ffd27a" stroke-width="1.6"/><circle cx="${n[0]}" cy="${n[1]}" r="5" fill="#ffd27a" stroke="#fff" stroke-width="2"/>`).join("")}
  </g>
</svg>`;
  }

  window.SentraAPI = { CONFIG, CITIES, loadData, submitData, aggregate, seedRaw, fmtNum, fmtRp, esc, toast, icon, heroArt, isDemo: () => !CONFIG.GAS_URL };
})();
