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

/* ---------------- LOGIN (sheet "users": kolom user & password) ----------------
   - Spreadsheet user = USERS_SS_ID (bisa berbeda dari spreadsheet data).
   - Login benar -> dibuat token acak, disimpan di CacheService (maks 6 jam).
   - Semua aksi baca/tulis data WAJIB membawa token ini.
   - 5x salah berturut-turut untuk user yang sama -> dikunci 5 menit. */
const USERS_SS_ID = '15Yd-3IcukNwFIfmhI6hy8j0e_80FK-ix8d6AKqMwtd8';
const USERS_SHEET = 'users';
const SESSION_TTL = 21600;   // detik (6 jam = batas maksimal CacheService)
const MAX_FAIL = 5;
const LOCK_SECONDS = 300;

/* Jalankan SEKALI dari editor (Run) untuk memberi izin akses ke spreadsheet users. */
function authSetup() {
  const sh = usersSheet_();
  Logger.log('Sheet users OK, jumlah baris: ' + sh.getLastRow());
}

function usersSheet_() {
  const ss = SpreadsheetApp.openById(USERS_SS_ID);
  const want = USERS_SHEET.toLowerCase();
  const sh = ss.getSheets().filter(function (s) { return s.getName().trim().toLowerCase() === want; })[0];
  if (!sh) throw new Error('Sheet "' + USERS_SHEET + '" tidak ditemukan');
  return sh;
}

function authError_() {
  const e = new Error('Sesi berakhir, silakan login kembali');
  e.code = 'AUTH';
  return e;
}

function requireAuth_(token) {
  token = String(token || '');
  if (!token || !CacheService.getScriptCache().get('sess_' + token)) throw authError_();
}

function login_(b) {
  const user = String(b.user || '').trim();
  const pass = String(b.password || '').trim();
  if (!user || !pass) return { ok: false, error: 'Isi user dan password' };

  const cache = CacheService.getScriptCache();
  const fkey = 'fail_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, user.toLowerCase()));
  const fails = Number(cache.get(fkey) || 0);
  if (fails >= MAX_FAIL) return { ok: false, error: 'Terlalu banyak percobaan salah. Coba lagi dalam 5 menit.' };

  const vals = usersSheet_().getDataRange().getValues();
  const head = (vals[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  const iu = head.indexOf('user'), ip = head.indexOf('password');
  if (iu < 0 || ip < 0) throw new Error('Sheet users harus punya kolom "user" dan "password"');

  let found = null;
  for (let i = 1; i < vals.length; i++) {
    const u = String(vals[i][iu]).trim();
    const p = String(vals[i][ip]).trim();
    if (u && p && u.toLowerCase() === user.toLowerCase() && p === pass) { found = u; break; }
  }
  if (!found) {
    cache.put(fkey, String(fails + 1), LOCK_SECONDS);
    return { ok: false, error: 'User atau password salah' };
  }
  cache.remove(fkey);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cache.put('sess_' + token, found, SESSION_TTL);
  return { ok: true, token: token, user: found, ttl: SESSION_TTL };
}

function logout_(b) {
  const t = String(b.token || '');
  if (t) CacheService.getScriptCache().remove('sess_' + t);
  return { ok: true };
}

function errJson_(err) {
  const o = { ok: false, error: String(err && err.message || err) };
  if (err && err.code) o.code = err.code;
  return json_(o);
}

/* ---------------- ENDPOINT ---------------- */
function doGet(e) {
  try {
    requireAuth_(e && e.parameter && e.parameter.token);
    return json_({
      ok: true,
      sentra: readSheet_('Sentra'),
      kelolaan: readKelolaan_(),
      banks: readBankHeaders_(),
      personil: readSheet_('Personil'),
      infrastruktur: readSheet_('Infrastruktur'),
      ts: new Date().toISOString()
    });
  } catch (err) {
    return errJson_(err);
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Format permintaan tidak valid' });
  }
  // login & logout tidak butuh token dan tidak perlu lock
  try {
    if (body.action === 'login')  return json_(login_(body));
    if (body.action === 'logout') return json_(logout_(body));
    requireAuth_(body.token);
  } catch (err) {
    return errJson_(err);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.action === 'submit') {
      const res = saveSubmission_(body);
      return json_({ ok: true, id: res.id, updated: res.updated });
    }
    if (body.action === 'kelolaan_save')   return json_({ ok: true, result: saveKelolaan_(body) });
    if (body.action === 'kelolaan_delete') return json_({ ok: true, result: deleteKelolaan_(body) });
    if (body.action === 'personil_save')   return json_({ ok: true, result: savePersonil_(body) });
    if (body.action === 'personil_delete') return json_({ ok: true, result: deletePersonil_(body) });
    if (body.action === 'infra_save')       return json_({ ok: true, result: saveInfrastruktur_(body) });
    if (body.action === 'infra_delete')     return json_({ ok: true, result: deleteInfrastruktur_(body) });
    throw new Error('Aksi tidak dikenal');
  } catch (err) {
    return errJson_(err);
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
    shS.getRange(ids.indexOf(id) + 1, 1, 1, 6).setValues([[id, nama, s.divisi, 'Region ' + region, kota, now]]);
  } else {
    const max = rows.reduce(function (m, r) { return Math.max(m, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0); }, 0);
    id = 'S' + ('0' + (max + 1)).slice(-2);
    if (max + 1 > 99) id = 'S' + (max + 1);
    shS.appendRow([id, nama, s.divisi, 'Region ' + region, kota, now]);
  }

  writeKelolaanWide_(id, nama, kel);
  replaceRows_('Personil', id, [[id, nama].concat(pers).concat([totalPeg])]);
  replaceRows_('Infrastruktur', id, [[id, nama, n(inf.mesin_hitung), n(inf.mesin_sortir), n(inf.mobil_cr_flm)]]);
  return { id: id, updated: updated };
}


/* ---------------- KELOLAAN FORMAT HORIZONTAL ----------------
   Sheet "Kelolaan": kolom A = id sentra, kolom B = nama sentra,
   kolom C dst (sampai AL atau lebih) = nama bank di baris 1,
   isi sel = jumlah kelolaan sentra tsb untuk bank tsb.
   Dikonversi ke format "panjang" yang dipakai website. */
function toNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var t = String(v == null ? '' : v).replace(/[^0-9.,\-]/g, '');
  if (!t) return 0;
  if (t.indexOf('.') >= 0 && t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else if (t.indexOf(',') >= 0) t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  var n = Number(t);
  return isFinite(n) ? n : 0;
}
function normName_(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ').replace(/^cou\s+/, ''); }

// daftar bank = header kolom C dst. di sheet Kelolaan (format horizontal),
// atau nilai unik kolom nama_bank (format lama). Dipakai untuk total user/bank.
function readBankHeaders_() {
  const sh = sheet_('Kelolaan');
  const v = sh.getDataRange().getValues();
  if (!v.length) return [];
  const h = v[0].map(function (x) { return String(x).trim(); });
  const seen = {}, out = [];
  const add = function (name) {
    const k = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
    if (k && !seen[k]) { seen[k] = 1; out.push(String(name).trim()); }
  };
  const iBank = h.map(function (x) { return x.toLowerCase(); }).indexOf('nama_bank');
  if (iBank >= 0) v.slice(1).forEach(function (r) { add(r[iBank]); });
  else for (var c = 2; c < h.length; c++) add(h[c]);
  return out;
}

function readKelolaan_() {
  const sh = sheet_('Kelolaan');
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0].map(function (x) { return String(x).trim(); });
  // format lama (panjang): ada kolom nama_bank
  if (h.map(function (x) { return x.toLowerCase(); }).indexOf('nama_bank') >= 0) return readSheet_('Kelolaan');

  const sentra = readSheet_('Sentra'), byId = {}, byName = {};
  sentra.forEach(function (s) { byId[String(s.id).trim().toUpperCase()] = s; byName[normName_(s.nama_sentra)] = s; });
  const out = [];
  v.slice(1).forEach(function (r) {
    const a = String(r[0] == null ? '' : r[0]).trim(), b = String(r[1] == null ? '' : r[1]).trim();
    if (!a && !b) return;
    const s = byId[a.toUpperCase()] || byName[normName_(a)] || byName[normName_(b)];
    if (!s) return;
    for (var c = 2; c < h.length; c++) {
      if (!h[c]) continue;
      const val = toNum_(r[c]);
      if (val > 0) out.push({ id_sentra: s.id, nama_sentra: s.nama_sentra, nama_bank: h[c], bisnis: '-', jumlah_kelolaan: val });
    }
  });
  return out;
}

function writeKelolaanWide_(id, nama, kel) {
  const sh = sheet_('Kelolaan');
  if (sh.getLastRow() === 0 || sh.getLastColumn() < 2) sh.getRange(1, 1, 1, 2).setValues([['id_sentra', 'nama_sentra']]);
  var lastCol = Math.max(2, sh.getLastColumn());
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim(); });
  const colOf = {};
  head.forEach(function (x, i) { if (i >= 2 && x) colOf[x.toLowerCase()] = i; });
  const sums = {};
  kel.forEach(function (r) {
    const k = r.bank.toLowerCase();
    if (!(k in colOf)) { head.push(r.bank); colOf[k] = head.length - 1; sh.getRange(1, head.length).setValue(r.bank); }
    sums[k] = (sums[k] || 0) + r.jml;
  });
  const width = head.length, last = sh.getLastRow();
  var rowIdx = -1;
  if (last > 1) {
    const ab = sh.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < ab.length; i++) {
      if (String(ab[i][0]).trim().toUpperCase() === String(id).toUpperCase() || normName_(ab[i][1]) === normName_(nama)) { rowIdx = i + 2; break; }
    }
  }
  if (rowIdx < 0) rowIdx = Math.max(last, 1) + 1;
  const row = [];
  for (var c = 0; c < width; c++) row.push('');
  row[0] = id; row[1] = nama;
  Object.keys(sums).forEach(function (k) { row[colOf[k]] = sums[k]; });
  sh.getRange(rowIdx, 1, 1, width).setValues([row]);
}

/* ---------------- CRUD KELOLAAN (menu Edit > Edit Kelolaan) ----------------
   kelolaan_save   : { id_sentra, items:[{nama_bank, jumlah_kelolaan}] }
                     -> menimpa seluruh baris kelolaan sentra tsb (baris baru jika belum ada,
                        bank yang tidak ada di items dikosongkan).
   kelolaan_delete : { id_sentra } -> menghapus baris kelolaan sentra tsb. */
function findSentra_(idSentra) {
  const id = String(idSentra || '').trim().toUpperCase();
  if (!id) throw new Error('id_sentra wajib diisi');
  const s = readSheet_('Sentra').filter(function (r) { return String(r.id).trim().toUpperCase() === id; })[0];
  if (!s) throw new Error('Sentra ' + idSentra + ' tidak ditemukan di sheet Sentra');
  return s;
}

function findKelolaanRow_(sh, id, nama) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ab = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < ab.length; i++) {
    if (String(ab[i][0]).trim().toUpperCase() === String(id).toUpperCase() || normName_(ab[i][1]) === normName_(nama)) return i + 2;
  }
  return -1;
}

function saveKelolaan_(b) {
  const s = findSentra_(b.id_sentra);
  const merged = {}, order = [];
  (b.items || []).forEach(function (r) {
    const bank = String((r && r.nama_bank) || '').trim().replace(/\s+/g, ' ');
    const jml = Math.max(0, toNum_(r && r.jumlah_kelolaan));
    if (!bank) return;
    if (jml <= 0) throw new Error('Jumlah kelolaan untuk ' + bank + ' harus lebih dari 0');
    const k = bank.toLowerCase();
    if (!(k in merged)) { merged[k] = { bank: bank, bisnis: '-', jml: 0 }; order.push(k); }
    merged[k].jml += jml;
  });
  if (!order.length) throw new Error('Minimal satu bank dengan jumlah kelolaan > 0 (gunakan Hapus untuk mengosongkan)');
  const kel = order.map(function (k) { return merged[k]; });
  writeKelolaanWide_(s.id, s.nama_sentra, kel);
  return { id_sentra: s.id, banks: kel.length, total: kel.reduce(function (a, r) { return a + r.jml; }, 0) };
}

function deleteKelolaan_(b) {
  const s = findSentra_(b.id_sentra);
  const sh = sheet_('Kelolaan');
  const row = findKelolaanRow_(sh, s.id, s.nama_sentra);
  if (row < 0) throw new Error('Data kelolaan ' + s.nama_sentra + ' tidak ditemukan');
  sh.deleteRow(row);
  return { id_sentra: s.id, deleted: true };
}

/* ---------------- CRUD PERSONIL (menu Edit > Edit Personil) ----------------
   personil_save   : { id_sentra, personil:{driver, custody_restock, custody_flm, custody_driver, admin, manager, asmen} }
                     -> menimpa baris personil sentra tsb (total_pegawai dihitung ulang).
   personil_delete : { id_sentra } -> menghapus baris personil sentra tsb. */
const PERS_KEYS = ['driver', 'custody_restock', 'custody_flm', 'custody_driver', 'admin', 'manager', 'asmen'];

function savePersonil_(b) {
  const s = findSentra_(b.id_sentra);
  const v = b.personil || {};
  const vals = PERS_KEYS.map(function (k) {
    const n = Number(v[k]);
    if (v[k] !== undefined && v[k] !== '' && (!isFinite(n) || n < 0)) throw new Error('Nilai ' + k + ' tidak valid');
    return Math.max(0, Math.floor(n || 0));
  });
  const total = vals.reduce(function (a, c) { return a + c; }, 0);
  if (!total) throw new Error('Isi minimal satu posisi dengan jumlah > 0 (gunakan Hapus untuk mengosongkan)');
  replaceRows_('Personil', s.id, [[s.id, s.nama_sentra].concat(vals).concat([total])]);
  return { id_sentra: s.id, total_pegawai: total };
}

function deletePersonil_(b) {
  const s = findSentra_(b.id_sentra);
  const exists = readSheet_('Personil').some(function (r) { return String(r.id_sentra).trim().toUpperCase() === String(s.id).trim().toUpperCase(); });
  if (!exists) throw new Error('Data personil ' + s.nama_sentra + ' tidak ditemukan');
  replaceRows_('Personil', s.id, []);
  return { id_sentra: s.id, deleted: true };
}

/* ---------------- CRUD INFRASTRUKTUR (menu Edit > Edit Infrastruktur) ----------------
   infra_save   : { id_sentra, infra:{mesin_hitung, mesin_sortir, mobil_cr_flm} } -> menimpa baris infrastruktur sentra tsb.
   infra_delete : { id_sentra } -> menghapus baris infrastruktur sentra tsb. */
const INFRA_KEYS = ['mesin_hitung', 'mesin_sortir', 'mobil_cr_flm'];

function saveInfrastruktur_(b) {
  const s = findSentra_(b.id_sentra);
  const v = b.infra || {};
  const vals = INFRA_KEYS.map(function (k) {
    const n = Number(v[k]);
    if (v[k] !== undefined && v[k] !== '' && (!isFinite(n) || n < 0)) throw new Error('Nilai ' + k + ' tidak valid');
    return Math.max(0, Math.floor(n || 0));
  });
  if (!vals.some(function (x) { return x > 0; })) throw new Error('Isi minimal satu unit dengan jumlah > 0 (gunakan Hapus untuk mengosongkan)');
  replaceRows_('Infrastruktur', s.id, [[s.id, s.nama_sentra].concat(vals)]);
  return { id_sentra: s.id, mesin_hitung: vals[0], mesin_sortir: vals[1], mobil_cr_flm: vals[2] };
}

function deleteInfrastruktur_(b) {
  const s = findSentra_(b.id_sentra);
  const exists = readSheet_('Infrastruktur').some(function (r) { return String(r.id_sentra).trim().toUpperCase() === String(s.id).trim().toUpperCase(); });
  if (!exists) throw new Error('Data infrastruktur ' + s.nama_sentra + ' tidak ditemukan');
  replaceRows_('Infrastruktur', s.id, []);
  return { id_sentra: s.id, deleted: true };
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
// kelolaan = JUMLAH (angka biasa, bukan Rp); personil = [driver, cust.restock, cust.FLM, cust.driver, admin, manager, asmen]; infra = [mesin hitung, mesin sortir, mobil CR FLM]
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
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('PERINGATAN', 'Ini akan MENGHAPUS data pada sheet Sentra, Kelolaan, Personil, Infrastruktur dan menggantinya dengan data dummy. Lanjutkan?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  Object.keys(SHEETS).forEach(function (name) {
    const sh = sheet_(name), last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, SHEETS[name].length).clearContent();
  });
  const now = new Date().toISOString();
  const S = [], K = [], P = [], I = [];
  SEED.forEach(function (s, i) {
    const id = 'S' + ('0' + (i + 1)).slice(-2);
    S.push([id, s.nama, s.divisi, s.region, s.kota, now]);
    s.banks.forEach(function (b) { K.push([id, s.nama, b[0], b[1], b[2]]); });
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
