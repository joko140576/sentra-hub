/**
 * ============================================================
 *  SENTRA HUB – Google Apps Script backend (anti-CORS)
 * ============================================================
 *  CARA PASANG
 *  1. Buat Google Spreadsheet baru (atau impor sentra_dummy.xlsx).
 *  2. Menu Extensions > Apps Script, hapus isi default, tempel seluruh kode ini.
 *  3. Pilih fungsi `seedDummy` > Run (izinkan akses) -> sheet + data dummy terbentuk.
 *     (Lewati langkah ini jika sudah impor xlsx. Sheet kosong otomatis dibuat saat dipakai.)
 *  4. Deploy > New deployment > jenis "Web app"
 *       Execute as : Me
 *       Who has access : Anyone
 *     Salin URL berakhiran /exec, tempel ke GAS_URL di file api.js.
 *  5. Setiap mengubah kode: Deploy > Manage deployments > Edit > New version.
 *
 *  KENAPA ANTI-CORS?
 *  - doGet/doPost mengembalikan ContentService JSON (Apps Script menambahkan
 *    header CORS terbuka untuk Web App "Anyone").
 *  - Frontend mengirim POST TANPA header Content-Type (jadi text/plain),
 *    sehingga browser tidak melakukan preflight OPTIONS (yang tidak didukung GAS).
 *  - Body dibaca dari e.postData.contents lalu di-JSON.parse.
 */

const SHEETS = {
  Sentra:        ['id', 'nama_sentra', 'divisi', 'region', 'kota', 'updated_at'],
  Kelolaan:      ['id_sentra', 'nama_sentra', 'nama_bank', 'bisnis', 'jumlah_kelolaan'],
  Personil:      ['id_sentra', 'nama_sentra', 'driver', 'custody_restock', 'custody_flm', 'custody_driver', 'admin', 'manager', 'asmen', 'total_pegawai'],
  Infrastruktur: ['id_sentra', 'nama_sentra', 'mesin_hitung', 'mesin_sortir', 'mobil_cr_flm']
};
const DIVISI = ['Opr 1', 'Opr 2'];
const BISNIS = ['CR & FLM', 'CIT', 'SLM'];

/* ---------------- ENDPOINT ---------------- */
function doGet(e) {
  try {
    return json_({
      ok: true,
      sentra: readSheet_('Sentra'),
      kelolaan: readSheet_('Kelolaan'),
      personil: readSheet_('Personil'),
      infrastruktur: readSheet_('Infrastruktur'),
      ts: new Date().toISOString()
    });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'submit') throw new Error('Aksi tidak dikenal');
    const res = saveSubmission_(body);
    return json_({ ok: true, id: res.id, updated: res.updated });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

/* ---------------- LOGIKA SIMPAN ---------------- */
function saveSubmission_(b) {
  const s = b.sentra || {};
  const nama = String(s.nama_sentra || '').trim();
  if (!nama) throw new Error('Nama sentra wajib diisi');
  if (DIVISI.indexOf(s.divisi) < 0) throw new Error('Divisi tidak valid');
  const region = Number(s.region);
  if (!(region >= 1 && region <= 10)) throw new Error('Region harus 1 - 10');
  const kota = String(s.kota || '').trim();

  const kel = (b.kelolaan || [])
    .map(function (r) { return { bank: String(r.nama_bank || '').trim(), bisnis: r.bisnis, jml: Math.max(0, Number(r.jumlah_kelolaan) || 0) }; })
    .filter(function (r) { return r.bank; });
  if (!kel.length) throw new Error('Minimal satu bank/kelolaan');
  kel.forEach(function (r) { if (BISNIS.indexOf(r.bisnis) < 0) throw new Error('Bisnis tidak valid: ' + r.bisnis); });

  const n = function (v) { return Math.max(0, Math.floor(Number(v) || 0)); };
  const p = b.personil || {}, inf = b.infrastruktur || {};
  const pers = [n(p.driver), n(p.custody_restock), n(p.custody_flm), n(p.custody_driver), n(p.admin), n(p.manager), n(p.asmen)];
  const totalPeg = pers.reduce(function (a, c) { return a + c; }, 0);

  const now = new Date().toISOString();
  const shS = sheet_('Sentra');
  const rows = readSheet_('Sentra');
  const found = rows.filter(function (r) { return String(r.nama_sentra).trim().toLowerCase() === nama.toLowerCase(); })[0];
  let id, updated = false;
  if (found) {
    id = found.id; updated = true;
    const ids = shS.getRange(1, 1, shS.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
    shS.getRange(ids.indexOf(id) + 1, 1, 1, 6).setValues([[id, nama, s.divisi, region, kota, now]]);
  } else {
    const max = rows.reduce(function (m, r) { return Math.max(m, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0); }, 0);
    id = 'S' + ('0' + (max + 1)).slice(-2);
    if (max + 1 > 99) id = 'S' + (max + 1);
    shS.appendRow([id, nama, s.divisi, region, kota, now]);
  }

  replaceRows_('Kelolaan', id, kel.map(function (r) { return [id, nama, r.bank, r.bisnis, r.jml]; }));
  replaceRows_('Personil', id, [[id, nama].concat(pers).concat([totalPeg])]);
  replaceRows_('Infrastruktur', id, [[id, nama, n(inf.mesin_hitung), n(inf.mesin_sortir), n(inf.mobil_cr_flm)]]);
  return { id: id, updated: updated };
}

/* ---------------- HELPER ---------------- */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  const head = SHEETS[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#0c1322').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSheet_(name) {
  const sh = sheet_(name);
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1)
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) { const o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}

// hapus baris milik id lalu tulis ulang (kolom pertama = id sentra)
function replaceRows_(name, id, newRows) {
  const sh = sheet_(name), width = SHEETS[name].length, last = sh.getLastRow();
  let keep = [];
  if (last > 1) {
    keep = sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) { return String(r[0]) !== String(id); });
    sh.getRange(2, 1, last - 1, width).clearContent();
  }
  const all = keep.concat(newRows);
  if (all.length) sh.getRange(2, 1, all.length, width).setValues(all);
}

/* ---------------- DATA DUMMY ---------------- */
// kelolaan dalam MILIAR rupiah; personil = [driver, cust.restock, cust.FLM, cust.driver, admin, manager, asmen]; infra = [mesin hitung, mesin sortir, mobil CR FLM]
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

/** Jalankan SEKALI dari editor untuk mengisi spreadsheet dengan data dummy (data lama dikosongkan). */
function seedDummy() {
  Object.keys(SHEETS).forEach(function (name) {
    const sh = sheet_(name), last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, SHEETS[name].length).clearContent();
  });
  const now = new Date().toISOString();
  const S = [], K = [], P = [], I = [];
  SEED.forEach(function (s, i) {
    const id = 'S' + ('0' + (i + 1)).slice(-2);
    S.push([id, s.nama, s.divisi, s.region, s.kota, now]);
    s.banks.forEach(function (b) { K.push([id, s.nama, b[0], b[1], b[2] * 1e9]); });
    const tot = s.personil.reduce(function (a, c) { return a + c; }, 0);
    P.push([id, s.nama].concat(s.personil).concat([tot]));
    I.push([id, s.nama, s.infra[0], s.infra[1], s.infra[2]]);
  });
  [['Sentra', S], ['Kelolaan', K], ['Personil', P], ['Infrastruktur', I]].forEach(function (x) {
    sheet_(x[0]).getRange(2, 1, x[1].length, SHEETS[x[0]].length).setValues(x[1]);
  });
  sheet_('Kelolaan').getRange('E2:E').setNumberFormat('#,##0');
  ss_().toast('Data dummy berhasil dibuat: ' + S.length + ' sentra', 'Sentra Hub', 5);
}
