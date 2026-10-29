/* =====================================================================
 * APP_CONFIG: ตั้งค่า/แบรนด์ของระบบ "จุดเดียว" (ย้ายไปบริษัทอื่นแก้เฉพาะบล็อกนี้)
 *  appName         ชื่อระบบ (หัวอีเมล ข้อความ LINE ชื่อแท็บเมื่อเสิร์ฟผ่าน Apps Script)
 *  timezone        เขตเวลา เช่น 'Asia/Bangkok'
 *  books           รายการชีทข้อมูล "ค่าตั้งต้น" (ใช้จนกว่าจะบันทึกจากหน้าเว็บ เมนู "จัดการคลัง" ซึ่งเก็บใน Script Properties และมีผลแทนค่านี้)
 *                  ติดตั้งให้ลูกค้าใหม่: ปล่อยเป็น [] แล้วให้แอดมินเชื่อมชีทเองจากหน้าเว็บ
 *      key  : ชื่อรหัสภายใน (ภาษาอังกฤษ ห้ามซ้ำ)
 *      name : ชื่อที่แสดงในเมนูเลือกบนหน้าเว็บ
 *      id   : Spreadsheet ID (ส่วนระหว่าง /d/ และ /edit ใน URL) เว้นว่าง '' = ใช้ไฟล์ที่ผูกกับสคริปต์นี้
 *      ทุกไฟล์ต้องมีแท็บชื่อเดียวกัน: สรุปรายงาน, รายการวัสดุ, รับเข้า, เบิก
 *  jobBookKey      key ของชีทที่ใช้ใบงานเข้าเล่มได้ (ค่าตั้งต้น เลือกใหม่ได้จากหน้า "จัดการคลัง")
 *  templateId      Spreadsheet ID ของชีทต้นแบบ (ล้างข้อมูลแล้ว) สำหรับปุ่ม "สร้างคลังใหม่จากต้นแบบ" เว้นว่างได้ ตั้งจากหน้าเว็บแทนได้
 *  reqPerHour      เพดานจำนวนคำขอ (เบิก+คืน) ต่อชั่วโมงต่อคน
 *  defaultAdminPw  รหัสแอดมินเริ่มต้นก่อนตั้งรหัสครั้งแรก (ระบบบังคับให้เปลี่ยนตอนล็อกอิน)
 * หมายเหตุ: ค่าที่หน้าเว็บใช้ (API URL, โลโก้, ชื่อผู้จัดทำ) อยู่ที่ APP_CONFIG ต้นไฟล์ index.html
 * ===================================================================== */
const APP_CONFIG = {
  appName: 'ระบบจัดการวัสดุสำนักงาน',
  timezone: 'Asia/Bangkok',
  books: [],
  jobBookKey: '',
  templateId: '',
  reqPerHour: 20,
  defaultAdminPw: 'admin1234'
};
/* =====================================================================
 * รายการคลัง (ชีทข้อมูล) — จัดการจากหน้าเว็บ เมนู "จัดการคลัง" (แอดมิน)
 *  - เก็บใน Script Properties: BOOKS_JSON (รายการคลัง), JOB_BOOK_KEY (คลังที่ใช้ใบงานเข้าเล่ม; '-' = ไม่ใช้), TEMPLATE_ID (ชีทต้นแบบ)
 *  - ถ้ายังไม่เคยบันทึกจากหน้าเว็บ จะใช้ค่าตั้งต้นจาก APP_CONFIG.books / jobBookKey / templateId
 *  - คลังที่ "ซ่อน" จะไม่ขึ้นในเมนูเลือก แต่ข้อมูลในชีทยังอยู่ครบ (ไม่มีการลบคลัง)
 * ===================================================================== */
const BOOKS_PROP_ = 'BOOKS_JSON', JOBKEY_PROP_ = 'JOB_BOOK_KEY', TEMPLATE_PROP_ = 'TEMPLATE_ID', MAX_BOOKS_ = 12;
let BOOKS_MEMO_ = null;
// ทุกคลังรวมที่ซ่อน
function allBooks_() {
  if (BOOKS_MEMO_) return BOOKS_MEMO_;
  let list = null;
  try {
    const raw = propsSnap_().getProperty(BOOKS_PROP_);
    if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) list = a; }
  } catch (e) {}
  if (list === null) list = APP_CONFIG.books || [];
  return (BOOKS_MEMO_ = list.filter(b => b && b.key));
}
// คลังที่ใช้งานอยู่ (ไม่รวมที่ซ่อน)
function getBookList_() { return allBooks_().filter(b => !b.hidden); }
function pickBook_(k) { const l = getBookList_(); return l.filter(b => b.key === k)[0] || (k ? null : l[0]) || null; }
function jobBookKey_() {
  const v = propsSnap_().getProperty(JOBKEY_PROP_);
  if (v === null) return String(APP_CONFIG.jobBookKey || '');
  return v === '-' ? '' : v;
}
function templateId_() { return propsSnap_().getProperty(TEMPLATE_PROP_) || APP_CONFIG.templateId || ''; }

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.appName)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// รายชื่อชีทสำหรับเมนูเลือก (ไม่ส่ง ID ไปที่หน้าเว็บ)
function getBooks() {
  const jk = jobBookKey_();
  return getBookList_().map(b => ({ key: b.key, name: b.name, job: !!jk && b.key === jk }));
}

// เปิดสเปรดชีตตาม key ที่เลือก
const SS_MEMO_ = {};
function getSS(bookKey) {
  const mk = String(bookKey || '');
  if (SS_MEMO_[mk]) return SS_MEMO_[mk];
  const book = pickBook_(bookKey);
  if (!book) throw new Error('ไม่พบชีทที่เลือก: ' + bookKey);
  try {
    return (SS_MEMO_[mk] = book.id ? SpreadsheetApp.openById(book.id) : SpreadsheetApp.getActiveSpreadsheet());
  } catch (e) {
    throw new Error('เปิด "' + book.name + '" ไม่ได้ ตรวจสอบ Spreadsheet ID และสิทธิ์การเข้าถึง');
  }
}

/* =====================================================================
 * แคชสั้นๆ สำหรับคำสั่งที่ "อ่านอย่างเดียว" (ทำให้ระบบเร็วขึ้น)
 * - ใช้เฉพาะตอนเรียกผ่าน doPost (VIA_API_ = true) ซึ่งล้างแคชทุกครั้งที่มีคำสั่งเขียน/แก้ข้อมูล
 *   (ดู READ_ONLY_ ท้ายไฟล์) จึงเห็นผลอนุมัติ/เบิก/รับเข้าทันที
 * - ถ้ามีคนไปแก้ข้อมูลในชีทตรงๆ จะเห็นการเปลี่ยนแปลงภายใน TTL_ (วินาที) ด้านล่าง
 * - ใช้ "เลขเวอร์ชัน" ต่อท้ายชื่อคีย์ การล้างแคช = เปลี่ยนเลขเวอร์ชัน (ไม่ต้องไล่ลบทีละคีย์)
 * ===================================================================== */
let VIA_API_ = false;
let CVER_ = null;
const TTL_ = { dash: 60, mats: 120, hist: 60, req: 100, bal: 100, pend: 100, net: 100 };   // req/bal/pend/net ยาวกว่ารอบโพลล์ 45 วิของหน้าแอดมิน จะได้โดนแคชบ่อย
const CACHE_CHUNK_ = 30000, CACHE_MAX_CHUNKS_ = 40;     // ค่าละ <= 100KB: ไทย 3 ไบต์/ตัว จึงแบ่งก้อนละ 30,000 ตัวอักษร

function resolveBook_(bookKey) {
  const book = pickBook_(bookKey);
  if (!book) throw new Error('ไม่พบชีทที่เลือก: ' + bookKey);
  return book;
}
function cacheVer_() {
  if (CVER_ !== null) return CVER_;
  try { CVER_ = CacheService.getScriptCache().get('DVER') || '0'; } catch (e) { CVER_ = '0'; }
  return CVER_;
}
function bumpCacheVer_() {
  CVER_ = String(Date.now()) + String(Math.floor(Math.random() * 1000));
  try { CacheService.getScriptCache().put('DVER', CVER_, 21600); } catch (e) {}
}
function hash_(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '.' + str.length;
}
// อ่านจากแคช ถ้าไม่มีให้เรียก fn() แล้วเก็บไว้ (JSON, แบ่งก้อนถ้าใหญ่) — error จาก fn ส่งต่อตามเดิมและไม่ถูกแคช
function cached_(type, bookKey, fn, extra) {
  if (!VIA_API_) return fn();
  const cache = CacheService.getScriptCache();
  const key = 'C' + cacheVer_() + '_' + type + '_' + bookKey + (extra ? '_' + extra : '');
  try {
    const meta = cache.get(key);
    if (meta !== null && meta !== undefined) {
      const n = Number(meta), keys = [];
      for (let i = 0; i < n; i++) keys.push(key + '~' + i);
      const parts = cache.getAll(keys);
      let txt = '', ok = n >= 1;
      for (let i = 0; ok && i < n; i++) { const pc = parts[key + '~' + i]; if (pc === null || pc === undefined) ok = false; else txt += pc; }
      if (ok) return JSON.parse(txt);
    }
  } catch (e) {}
  const val = fn();
  try {
    const txt = JSON.stringify(val), put = {};
    let n = 0;
    for (let pos = 0; pos < txt.length || n === 0; n++) {
      let end = Math.min(txt.length, pos + CACHE_CHUNK_);
      const cc = txt.charCodeAt(end - 1);
      if (end < txt.length && cc >= 0xD800 && cc <= 0xDBFF) end--;      // ไม่ตัดกลางอักขระ emoji
      put[key + '~' + n] = txt.slice(pos, end);
      pos = end;
      if (n >= CACHE_MAX_CHUNKS_) return val;                            // ใหญ่เกินไป ไม่แคช
    }
    put[key] = String(n);
    cache.putAll(put, TTL_[type] || 60);
  } catch (e) {}
  return val;
}
// อ่าน Script Properties ทั้งก้อนครั้งเดียว (เร็วกว่า getProperty ทีละคีย์หลายเท่า) ใช้แทนออบเจ็กต์ properties ได้เลย
function propsSnap_() {
  const all = PropertiesService.getScriptProperties().getProperties() || {};
  return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(all, k) ? all[k] : null; } };
}

// ตัวห่อแบบแคช (ใช้เฉพาะคำสั่งอ่านอย่างเดียว; คำสั่งเขียนยังเรียกฟังก์ชันตัวจริงที่อ่านสดเสมอ)
function dashC_(bk)      { return cached_('dash', resolveBook_(bk).key, () => getDashboardData(bk)); }
function matsC_(bk)      { return cached_('mats', resolveBook_(bk).key, () => getMaterialList(bk)); }
function histC_(bk)      { return cached_('hist', resolveBook_(bk).key, () => getAllHistory('', bk)); }
function reqGroupsC_(bk) { return cached_('req',  resolveBook_(bk).key, () => readRequestGroups_(getSS(bk))); }
function balancesC_(bk)  { return cached_('bal',  resolveBook_(bk).key, () => readBalances_(getSS(bk))); }
function pendCountC_(bk) {
  return cached_('pend', resolveBook_(bk).key, function () {
    const s = getSS(bk).getSheetByName(REQ_SHEET_);
    if (!s || s.getLastRow() <= 1) return 0;
    const seen = {};
    s.getRange(2, 1, s.getLastRow() - 1, 10).getValues().forEach(r => { if (r[0] && String(r[9]).trim() === ST_WAIT_) seen[String(r[0])] = 1; });
    return Object.keys(seen).length;
  });
}
// เบิกสุทธิ (ตามรหัสวัสดุ) ของหลายคนในครั้งเดียว: wanted = { ชื่อที่ผ่าน normTrimLower_: true } -> { ชื่อ: { รหัส: จำนวน } }
function netManyC_(bk, wanted) {
  const ks = Object.keys(wanted).sort(), id = ks.join('\u0001');
  if (!ks.length) return {};
  const compute = function () {
    const r = netIndex_(getSS(bk), normTrimLower_, wanted), v = {};
    ks.forEach(k => { v[k] = r[k].byCode; });
    return { w: id, v: v };
  };
  let res = cached_('net', resolveBook_(bk).key, compute, hash_(id));
  if (!res || res.w !== id) res = compute();     // กันกรณีแฮชชนกัน
  return res.v;
}

// 1. ดึงข้อมูลภาพรวมสต็อกสำหรับ Dashboard
function getDashboardData(bookKey) {
  const ss = getSS(bookKey);
  const summarySheet = ss.getSheetByName('สรุปรายงาน');
  if (!summarySheet) throw new Error('ไม่พบแผ่นงาน "สรุปรายงาน" ในไฟล์นี้');

  const data = summarySheet.getDataRange().getValues();
  const items = [];
  let lowStockCount = 0;
  let normalStockCount = 0;

  for (let i = 4; i < data.length; i++) {
    const row = data[i];
    const code = row[0];
    const name = row[1];
    if (!code || !name) continue;

    const unit = row[2] || '';
    const inWarehouse = Number(row[3]) || 0;
    const inFrontStore = Number(row[4]) || 0;
    const stockIn = Number(row[5]) || 0;
    const stockOut = Number(row[6]) || 0;
    const balance = Number(row[7]) || 0;
    const minStock = Number(row[8]) || 0;
    const isLow = balance <= minStock;

    if (isLow) lowStockCount++;
    else normalStockCount++;

    items.push({
      code: String(code).trim(),
      name: String(name).trim(),
      unit: String(unit).trim(),
      inWarehouse: inWarehouse,
      inFrontStore: inFrontStore,
      stockIn: stockIn,
      stockOut: stockOut,
      balance: balance,
      minStock: minStock,
      isNeg: balance < 0,
      status: balance < 0 ? 'ติดลบ' : (isLow ? 'สินค้าใกล้หมด' : 'ปกติ'),
      isLow: isLow
    });
  }

  return {
    items: items,
    totalItems: items.length,
    lowStockCount: lowStockCount,
    normalStockCount: normalStockCount
  };
}

// 2. ดึงรายการวัสดุสำหรับ Dropdown
function getMaterialList(bookKey) {
  const ss = getSS(bookKey);
  const sheet = ss.getSheetByName('รายการวัสดุ');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const materials = [];

  for (let i = 1; i < data.length; i++) {
    const code = data[i][0];
    const name = data[i][1];
    const unit = data[i][2];
    const minStock = data[i][3] || 0;
    if (code && name) {
      materials.push({
        code: String(code).trim(),
        name: String(name).trim(),
        unit: String(unit || '').trim(),
        minStock: Number(minStock) || 0
      });
    }
  }
  return materials;
}

// ฟังก์ชันแปลงวันที่ให้เป็นสตริง YYYY-MM-DD
function formatDateString(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, APP_CONFIG.timezone, 'yyyy-MM-dd');
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, APP_CONFIG.timezone, 'yyyy-MM-dd');
  }
  return String(val);
}

// ฟังก์ชันแปลงเป็น Timestamp (ตัวเลขมิลลิวินาที) สำหรับเปรียบเทียบ
function parseToTimestamp(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.getTime();
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.getTime();
  }
  return null;
}

// แปลง 'YYYY-MM-DD' เป็น Date เวลา 00:00 (ถ้าไม่ส่งมาใช้วันนี้)
function parseDateParam_(str) {
  if (str) {
    const p = String(str).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// หาวัสดุจากรหัส (ไม่เชื่อชื่อจากหน้าเว็บ) และกันชื่อซ้ำ เพราะสูตรในชีทค้นรหัสจากชื่อ
// อ่านแท็บ "รายการวัสดุ" ครั้งเดียว แล้วค้นในหน่วยความจำ (ใช้เมื่อต้องค้นหลายรหัสพร้อมกัน)
function loadMaterials_(ss) {
  const sh = ss.getSheetByName('รายการวัสดุ');
  if (!sh) throw new Error('ไม่พบแผ่นงาน "รายการวัสดุ"');
  const data = sh.getDataRange().getValues();
  const byCode = Object.create(null), nameCnt = Object.create(null);
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][1]).trim(), code = String(data[i][0]).trim();
    nameCnt[name] = (nameCnt[name] || 0) + 1;
    if (!(code in byCode)) byCode[code] = { code: code, name: name, unit: String(data[i][2] || '').trim() };
  }
  return { byCode: byCode, nameCnt: nameCnt };
}

// ค้นวัสดุจากรหัส (ไม่เชื่อชื่อจากหน้าเว็บ) และกันชื่อซ้ำ เพราะสูตรในชีทค้นรหัสจากชื่อ
function pickMaterial_(M, code) {
  const found = M.byCode[code];
  if (!found) return null;
  const dup = M.nameCnt[found.name] || 0;
  if (dup > 1) throw new Error('มีวัสดุชื่อ "' + found.name + '" ซ้ำกัน ' + dup + ' รายการ กรุณาแก้ชื่อในแท็บรายการวัสดุให้ไม่ซ้ำก่อน');
  return found;
}

function findMaterial_(ss, code) { return pickMaterial_(loadMaterials_(ss), code); }

/* ===== ตัวช่วยความปลอดภัยของข้อความที่ผู้ใช้พิมพ์ ===== */
// ล้างข้อความ: ตัดช่องว่างหัวท้าย รวมช่องว่างซ้อน และตรวจความยาว (เกินแล้วแจ้งผิดพลาด ไม่ตัดเงียบๆ)
function cleanText_(v, max, label) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (max && s.length > max) throw new Error(label + 'ยาวเกินไป (ไม่เกิน ' + max + ' ตัวอักษร)');
  return s;
}
// ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกชีทตีเป็นสูตร
function isFormulaLike_(s) { return /^[=+\-@]/.test(String(s == null ? '' : s).replace(/^\s+/, '')); }
// ใช้กับช่องข้อความอิสระ (ชื่อผู้เบิก หมายเหตุ ฯลฯ): ใส่ ' นำหน้าให้ชีทเก็บเป็นข้อความล้วน
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return isFormulaLike_(v) ? "'" + v : v;
}
// ใช้กับชื่อ/รหัสวัสดุ: ปฏิเสธเลย เพราะใส่ ' แล้ว XLOOKUP จะหาชื่อไม่เจอ
function assertNotFormula_(s, label) {
  if (isFormulaLike_(s)) throw new Error(label + 'ห้ามขึ้นต้นด้วยเครื่องหมาย = + - หรือ @ กรุณาพิมพ์ให้ถูกหลัก (เช่น เริ่มด้วยตัวอักษรหรือตัวเลข)');
}
const LIM_ = { person: 60, note: 200, matName: 100, unit: 20, code: 30, reason: 100, project: 100 };

// เขียนแถวลงชีท รับเข้า / เบิก (ใช้ร่วมกันทั้งรับเข้า เบิกจ่าย และปรับยอด)
function appendTx_(ss, type, txDate, materialName, qty, person, note) {
  return appendTxBatch_(ss, type, [{ txDate: txDate, name: materialName, qty: qty, person: person, note: note }])[0];
}

// หาแถวว่าง n แถวแรกจากคอลัมน์ C (ชื่อวัสดุ) ถ้าชีทเต็มจะเพิ่มแถวให้ก่อน
function findEmptyRows_(sheet, n) {
  const lastRow = sheet.getLastRow();
  const scan = Math.min(Math.max(lastRow + n + 10, 100), sheet.getMaxRows());
  const colC = sheet.getRange(1, 3, scan, 1).getValues();
  const rows = [];
  for (let i = 1; i < colC.length && rows.length < n; i++) {
    const v = colC[i][0];
    if (v === '' || v === null || v === undefined) rows.push(i + 1);
  }
  let next = Math.max(scan, lastRow) + 1;
  while (rows.length < n) rows.push(next++);
  const need = rows[rows.length - 1];
  if (need > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
  return rows;
}

// เขียนหลายรายการลงชีท รับเข้า / เบิก ในคราวเดียว  items = [{ txDate, name, qty, person, note }]
// แต่ละรายการได้แถวของตัวเองเหมือนเดิม (แถวที่ติดกันเขียนด้วยคำสั่งเดียว)
function appendTxBatch_(ss, type, items) {
  if (!items.length) return [];
  const sheetName = (type === 'IN') ? 'รับเข้า' : 'เบิก';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('ไม่พบแผ่นงาน "' + sheetName + '"');
  const rows = findEmptyRows_(sheet, items.length);
  const values = items.map(function (it, k) {
    const row = rows[k];
    const fB = '=IF(C' + row + '="", "", XLOOKUP(C' + row + ', \'รายการวัสดุ\'!$B:$B, \'รายการวัสดุ\'!$A:$A, "ไม่พบรหัส"))';
    const fD = '=IF(C' + row + '="", "", XLOOKUP(C' + row + ', \'รายการวัสดุ\'!$B:$B, \'รายการวัสดุ\'!$C:$C, "ไม่พบหน่วย"))';
    return [it.txDate, fB, it.name, fD, it.qty, safeCell_(it.person), safeCell_(it.note || '')];
  });
  try {
    let a = 0;
    while (a < rows.length) {
      let b = a;
      while (b + 1 < rows.length && rows[b + 1] === rows[b] + 1) b++;
      sheet.getRange(rows[a], 1, b - a + 1, 7).setValues(values.slice(a, b + 1));
      a = b + 1;
    }
  } catch (e) {
    throw new Error('เขียนลงชีท "' + sheetName + '" ไม่ได้ (ถ้าชีทมีตัวกรองค้างอยู่ ให้ล้างตัวกรองก่อน): ' + e.message);
  }
  return rows;
}

// ต่อแถวท้ายชีท (ใช้กับแท็บบันทึก) ครั้งเดียวหลายแถว
function appendRows_(sheet, values) {
  if (!values.length) return;
  const start = sheet.getLastRow() + 1, end = start + values.length - 1;
  if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
  sheet.getRange(start, 1, values.length, values[0].length).setValues(values);
}

// 3. บันทึกข้อมูลรับเข้า/เบิกจ่าย (formData.book = ชีทที่เลือก, formData.force = ยืนยันเบิกเกินยอด)
function recordTransaction(formData) {
  const ss = getSS(formData.book);
  const type = formData.type;
  if (type !== 'IN' && type !== 'OUT') throw new Error('ประเภทรายการไม่ถูกต้อง');
  const qty = Number(formData.quantity);
  if (!isFinite(qty) || qty <= 0) throw new Error('จำนวนต้องเป็นตัวเลขมากกว่า 0');
  const person = cleanText_(formData.personName, LIM_.person, 'ชื่อผู้ดำเนินการ');
  if (!person) throw new Error('กรุณาระบุชื่อผู้ดำเนินการ');
  const txNote = cleanText_(formData.note, LIM_.note, 'หมายเหตุ');
  const txDate = parseDateParam_(formData.txDate);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const code = String(formData.materialCode || '').trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const mat = findMaterial_(ss, code);
    if (!mat) throw new Error('ไม่พบวัสดุรหัส ' + code + ' ในแท็บ "รายการวัสดุ"');

    if (type === 'OUT' && !formData.force) {
      const cur = readBalance_(ss, code);
      if (cur && qty > cur.balance) {
        return { success: false, needConfirm: true, name: mat.name, unit: mat.unit, balance: cur.balance };
      }
    }
    const row = appendTx_(ss, type, txDate, mat.name, qty, person, txNote);
    SpreadsheetApp.flush();
    return { success: true, message: 'บันทึกรายการลงแถวที่ ' + row + ' เรียบร้อยแล้ว' };
  } finally {
    lock.releaseLock();
  }
}

// อ่านยอดคงเหลือปัจจุบันของวัสดุจากแท็บ "สรุปรายงาน"
function readBalance_(ss, code) {
  const sh = ss.getSheetByName('สรุปรายงาน');
  if (!sh) throw new Error('ไม่พบแผ่นงาน "สรุปรายงาน" ในไฟล์นี้');
  const data = sh.getDataRange().getValues();
  for (let i = 4; i < data.length; i++) {
    if (String(data[i][0]).trim() === code) {
      return {
        name: String(data[i][1]).trim(),
        unit: String(data[i][2] || '').trim(),
        balance: Number(data[i][7]) || 0
      };
    }
  }
  return null;
}

// แท็บบันทึกการปรับยอด (สร้างให้อัตโนมัติถ้ายังไม่มี)
function ensureAdjLog_(ss) {
  let sh = ss.getSheetByName('ประวัติปรับยอด');
  if (!sh) sh = ss.insertSheet('ประวัติปรับยอด');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['เวลาที่บันทึก', 'วันที่ปรับ', 'รหัส', 'ชื่อวัสดุ', 'หน่วย', 'ยอดก่อนปรับ', 'ยอดหลังปรับ', 'ผลต่าง', 'เหตุผล', 'หมายเหตุ', 'ผู้ปรับ']);
    sh.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#ede9fe');
    sh.setFrozenRows(1);
  }
  return sh;
}

// 6. ปรับยอดสต็อก
// f = { book, code, mode: 'count' | 'delta', qty, date, person, reason, note }
// ระบบคำนวณผลต่างจากยอดในชีทอีกครั้งฝั่งเซิร์ฟเวอร์ แล้วบันทึกเป็นแถว "รับเข้า" (ปรับเพิ่ม)
// หรือ "เบิก" (ปรับลด) ขึ้นต้นหมายเหตุด้วย [ปรับยอด] สูตรในแท็บสรุปรายงานจึงอัปเดตเองโดยไม่ต้องแก้สูตร
function recordAdjustment(f) {
  const ss = getSS(f.book);
  const code = String(f.code || '').trim();
  const qty = Number(f.qty);
  if (!code || isNaN(qty)) throw new Error('ข้อมูลการปรับยอดไม่ครบ');
  const reason = cleanText_(f.reason || 'อื่นๆ', LIM_.reason, 'เหตุผล');
  const adjPerson = cleanText_(f.person, LIM_.person, 'ชื่อผู้ปรับ');
  const adjNote = cleanText_(f.note, LIM_.note, 'หมายเหตุ');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = readBalance_(ss, code);
    if (!cur) throw new Error('ไม่พบวัสดุรหัส ' + code + ' ในแท็บ "สรุปรายงาน"');

    const target = (f.mode === 'delta') ? cur.balance + qty : qty;
    if (target < 0) throw new Error('ยอดหลังปรับติดลบไม่ได้');
    const diff = Math.round((target - cur.balance) * 1e6) / 1e6;
    if (diff === 0) return { success: true, unchanged: true, message: 'ยอดตรงกับในระบบอยู่แล้ว ไม่มีการปรับ' };

    const txDate = parseDateParam_(f.date);
    const note = '[ปรับยอด] ' + reason + (adjNote ? ' - ' + adjNote : '');
    const row = appendTx_(ss, diff > 0 ? 'IN' : 'OUT', txDate, cur.name, Math.abs(diff), adjPerson, note);

    ensureAdjLog_(ss).appendRow([new Date(), txDate, code, cur.name, cur.unit, cur.balance, target, diff, safeCell_(reason), safeCell_(adjNote), safeCell_(adjPerson)]);
    SpreadsheetApp.flush();

    return {
      success: true, before: cur.balance, after: target, diff: diff,
      message: 'ปรับยอด ' + cur.name + ' จาก ' + cur.balance + ' เป็น ' + target + ' ' + cur.unit +
               ' (' + (diff > 0 ? '+' : '') + diff + ') บันทึกลงชีท' + (diff > 0 ? 'รับเข้า' : 'เบิก') + 'แถวที่ ' + row
    };
  } finally {
    lock.releaseLock();
  }
}

// 4. ดึงประวัติรายการทั้งหมด (หมายเหตุขึ้นต้น [ปรับยอด] แสดงเป็น ปรับเพิ่ม / ปรับลด, ขึ้นต้น [คืนเบิก] แสดงเป็น คืนเบิก)
function getAllHistory(filterCode, bookKey) {
  const ss = getSS(bookKey);
  const history = [];

  const pull = (sheetName, typeLabel, adjLabel, retLabel) => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() <= 1) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    rows.forEach(row => {
      if (row[0] && row[2]) {
        const code = String(row[1] || '').trim();
        if (!filterCode || code === filterCode) {
          const note = String(row[6] || '').trim();
          history.push({
            date: formatDateString(row[0]),
            rawDate: parseToTimestamp(row[0]),
            type: note.indexOf('[ปรับยอด]') === 0 ? adjLabel : (retLabel && note.indexOf('[คืนเบิก]') === 0 ? retLabel : typeLabel),
            code: code,
            name: String(row[2]).trim(),
            unit: String(row[3] || '').trim(),
            quantity: Number(row[4]) || 0,
            person: String(row[5] || '').trim(),
            note: note
          });
        }
      }
    });
  };

  pull('รับเข้า', 'รับเข้า', 'ปรับเพิ่ม', 'คืนเบิก');
  pull('เบิก', 'เบิกจ่าย', 'ปรับลด');

  history.sort((a, b) => (b.rawDate || 0) - (a.rawDate || 0));
  return history;
}

// 5. ออกรายงานสรุปตามช่วงเวลา (Date Range Report)
function generateDateRangeReport(startDateStr, endDateStr, bookKey) {
  const history = getAllHistory('', bookKey);
  const balances = readBalances_(getSS(bookKey));
  const rnd = v => Math.round(v * 1e6) / 1e6;
  const signed = it => {
    const q = Number(it.quantity) || 0;
    return (it.type === 'รับเข้า' || it.type === 'ปรับเพิ่ม' || it.type === 'คืนเบิก') ? q : -q;
  };

  const startParts = startDateStr.split('-');
  const endParts = endDateStr.split('-');
  const startTime = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 0, 0, 0, 0).getTime();
  const endTime = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]), 23, 59, 59, 999).getTime();

  const filteredLogs = [];
  const materialSummary = {};
  const netFromStart = {};   // ผลรวมรายการตั้งแต่วันเริ่มต้นช่วงจนถึงปัจจุบัน
  let totalInQty = 0, totalOutQty = 0, totalRetQty = 0, totalAdjQty = 0;

  history.forEach(item => {
    const t = item.rawDate;
    if (!t) return;
    const key = item.code || item.name;

    if (t >= startTime) netFromStart[key] = (netFromStart[key] || 0) + signed(item);

    if (t >= startTime && t <= endTime) {
      filteredLogs.push(item);
      if (!materialSummary[key]) {
        materialSummary[key] = { code: item.code, name: item.name, unit: item.unit, inQty: 0, outQty: 0, retQty: 0, adjQty: 0 };
      }
      const q = Number(item.quantity) || 0;
      if (item.type === 'รับเข้า') {
        materialSummary[key].inQty += q; totalInQty += q;
      } else if (item.type === 'เบิกจ่าย') {
        materialSummary[key].outQty += q; totalOutQty += q;
      } else if (item.type === 'คืนเบิก') {
        materialSummary[key].retQty += q; totalRetQty += q;
      } else {
        const s = signed(item);
        materialSummary[key].adjQty += s; totalAdjQty += s;
      }
    }
  });

  // คำนวณต้นงวด / ปลายงวด
  Object.keys(materialSummary).forEach(k => {
    const m = materialSummary[k], b = balances[m.code];
    if (b) {
      m.openQty = rnd(b.balance - (netFromStart[k] || 0));
      m.closeQty = rnd(m.openQty + m.inQty - m.outQty + m.retQty + m.adjQty);
    } else {
      m.openQty = null;
      m.closeQty = null;
    }
  });

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalTransactions: filteredLogs.length,
    totalInQty: totalInQty,
    totalOutQty: totalOutQty,
    totalRetQty: totalRetQty,
    totalAdjQty: totalAdjQty,
    summaryList: Object.values(materialSummary),
    logs: filteredLogs
  };
}

// 7. คืนเบิก (แอดมินบันทึก): พนักงานเบิกไปแล้วใช้ไม่หมด นำของมาคืน
// บันทึกเป็นแถว "รับเข้า" หมายเหตุขึ้นต้น [คืนเบิก] ยอดคงเหลือในแท็บสรุปรายงานจึงเพิ่มเองโดยไม่ต้องแก้สูตร
// f = { book, txDate, personName, note, items: [{ code, qty }], force }
// ถ้าคืนมากกว่าที่คนนี้เบิกไว้สุทธิ (เบิก - คืนที่เคยบันทึก) จะถามยืนยันก่อน (needConfirm)

// เบิกสุทธิของคนคนหนึ่งแยกตามรหัสวัสดุ = เบิกจ่าย - คืนเบิก
function netWithdrawn_(history, person) {
  const key = String(person || '').trim().toLowerCase(), m = {};
  history.forEach(h => {
    if (String(h.person || '').trim().toLowerCase() !== key) return;
    if (h.type === 'เบิกจ่าย') m[h.code] = (m[h.code] || 0) + h.quantity;
    else if (h.type === 'คืนเบิก') m[h.code] = (m[h.code] || 0) - h.quantity;
  });
  return m;
}

// อ่านแท็บ "เบิก" และ "รับเข้า" ครั้งเดียว แล้วรวม "เบิกสุทธิ" (เบิกจ่าย - คืนเบิก) เฉพาะชื่อที่ต้องการ
// เงื่อนไขเหมือน getAllHistory/netWithdrawn_ ทุกประการ (ต้องมีวันที่+ชื่อวัสดุ, หมายเหตุ [ปรับยอด] ไม่นับ) แต่ไม่สร้างออบเจ็กต์ประวัติทุกแถวและไม่เรียงลำดับ
// normFn = ฟังก์ชันทำชื่อให้เทียบกันได้, wanted = { ชื่อที่ผ่าน normFn: true }
// คืน { ชื่อที่ผ่าน normFn: { byCode: { รหัส: จำนวน }, byName: { ชื่อวัสดุ: จำนวน } } }
function netIndex_(ss, normFn, wanted) {
  const out = {};
  Object.keys(wanted).forEach(function (k) { out[k] = { byCode: {}, byName: {} }; });
  const scan = function (sheetName, isOut) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() <= 1) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0] || !r[2]) continue;
      const t = out[normFn(r[5])];
      if (!t) continue;
      const note = String(r[6] || '').trim();
      if (note.indexOf('[ปรับยอด]') === 0) continue;
      if (!isOut && note.indexOf('[คืนเบิก]') !== 0) continue;       // รับเข้าปกติไม่เกี่ยวกับยอดเบิกสุทธิ
      const q = (Number(r[4]) || 0) * (isOut ? 1 : -1);
      const code = String(r[1] || '').trim(), name = String(r[2]).trim();
      t.byCode[code] = (t.byCode[code] || 0) + q;
      t.byName[name] = (t.byName[name] || 0) + q;
    }
  };
  scan('เบิก', true);
  scan('รับเข้า', false);
  return out;
}
const normTrimLower_ = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
// เบิกสุทธิของคนเดียว แยกตามรหัสวัสดุ (แทน netWithdrawn_(getAllHistory(...)) ที่ต้องประกอบประวัติทั้งก้อน)
function netByCode_(ss, person) {
  const k = normTrimLower_(person), w = {}; w[k] = true;
  return netIndex_(ss, normTrimLower_, w)[k].byCode;
}

function recordReturn(f) {
  const ss = getSS(f.book);
  const person = cleanText_(f.personName, LIM_.person, 'ชื่อผู้คืน');
  if (!person) throw new Error('กรุณาระบุชื่อผู้คืน');
  const retNote = cleanText_(f.note, LIM_.note, 'หมายเหตุ');
  const txDate = parseDateParam_(f.txDate);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const raw = Array.isArray(f.items) ? f.items : [];
  if (!raw.length) throw new Error('ยังไม่มีรายการที่คืน');
  if (raw.length > 50) throw new Error('คืนได้ไม่เกิน 50 รายการต่อครั้ง');
  const merged = {}, order = [];
  raw.forEach(x => {
    const code = String(x && (x.code || x.materialCode) || '').trim();
    const qty = Number(x && (x.qty != null ? x.qty : x.quantity));
    if (!code) throw new Error('มีรายการที่ยังไม่ได้เลือกวัสดุ');
    if (!isFinite(qty) || qty <= 0) throw new Error('จำนวนที่คืนต้องมากกว่า 0 (รหัส ' + code + ')');
    if (!(code in merged)) { merged[code] = 0; order.push(code); }
    merged[code] += qty;
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const M = loadMaterials_(ss);
    // ตรวจทุกรายการก่อนเขียน ถ้าไม่ผ่านจะไม่เขียนอะไรเลย
    const items = order.map(code => {
      const mat = pickMaterial_(M, code);
      if (!mat) throw new Error('ไม่พบวัสดุรหัส ' + code + ' ในแท็บ "รายการวัสดุ"');
      return { mat: mat, qty: merged[code] };
    });
    if (!f.force) {
      const net = netByCode_(ss, person), over = [];
      items.forEach(it => {
        const n = Math.round((net[it.mat.code] || 0) * 1e6) / 1e6;
        if (it.qty > n) over.push({ name: it.mat.name, unit: it.mat.unit, qty: it.qty, withdrawn: n });
      });
      if (over.length) return { success: false, needConfirm: true, over: over };
    }
    const note = '[คืนเบิก]' + (retNote ? ' ' + retNote : '');
    appendTxBatch_(ss, 'IN', items.map(it => ({ txDate: txDate, name: it.mat.name, qty: it.qty, person: person, note: note })));
    SpreadsheetApp.flush();
    return { success: true, count: items.length, message: 'บันทึกคืนเบิก ' + items.length + ' รายการ จาก ' + person + ' เรียบร้อย ยอดคงเหลือเพิ่มขึ้นตามจำนวนที่คืน' };
  } finally {
    lock.releaseLock();
  }
}

// โหลดข้อมูลทั้งหมดในครั้งเดียว (แทนการเรียกแยก 3 ครั้ง)
function getAllData(bookKey, noHistory) {
  return {
    dash: dashC_(bookKey),
    materials: matsC_(bookKey),
    history: noHistory ? [] : histC_(bookKey)
  };
}

// อ่านยอดคงเหลือทุกรายการในครั้งเดียว
function readBalances_(ss) {
  const sh = ss.getSheetByName('สรุปรายงาน');
  if (!sh) throw new Error('ไม่พบแผ่นงาน "สรุปรายงาน" ในไฟล์นี้');
  const data = sh.getDataRange().getValues(), m = {};
  for (let i = 4; i < data.length; i++) {
    const c = String(data[i][0]).trim();
    if (c) m[c] = { name: String(data[i][1]).trim(), unit: String(data[i][2] || '').trim(), balance: Number(data[i][7]) || 0 };
  }
  return m;
}

// บันทึกผลตรวจนับหลายรายการ: f = { book, date, person, note, items: [{ code, counted }] }
// ตรวจทุกรายการก่อนเขียน ถ้ามีรายการไม่ถูกต้องจะไม่เขียนอะไรเลย
function recordCount(f) {
  const ss = getSS(f.book);
  const person = cleanText_(f.person, LIM_.person, 'ชื่อผู้นับ');
  if (!person) throw new Error('กรุณาระบุชื่อผู้นับ');
  const cntNote = cleanText_(f.note, LIM_.note, 'หมายเหตุ');
  const txDate = parseDateParam_(f.date);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const items = (function (a) { const m = {}; a.forEach(x => { m[String(x.code).trim()] = x; }); return Object.keys(m).map(k => m[k]); })((f.items || []).filter(x => x && x.counted !== '' && x.counted !== null && !isNaN(Number(x.counted))));
  if (!items.length) throw new Error('ยังไม่ได้กรอกยอดที่นับได้');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const bal = readBalances_(ss), todo = [];
    let same = 0;
    items.forEach(it => {
      const code = String(it.code).trim(), cur = bal[code], target = Number(it.counted);
      if (!cur) throw new Error('ไม่พบวัสดุรหัส ' + code + ' ในแท็บ "สรุปรายงาน"');
      if (target < 0) throw new Error(code + ': ยอดที่นับติดลบไม่ได้');
      const diff = Math.round((target - cur.balance) * 1e6) / 1e6;
      if (diff === 0) { same++; return; }
      todo.push({ code: code, cur: cur, target: target, diff: diff });
    });
    const log = ensureAdjLog_(ss);
    const note = '[ปรับยอด] นับสต็อก' + (cntNote ? ' - ' + cntNote : '');
    const mk = t => ({ txDate: txDate, name: t.cur.name, qty: Math.abs(t.diff), person: person, note: note });
    appendTxBatch_(ss, 'IN', todo.filter(t => t.diff > 0).map(mk));
    appendTxBatch_(ss, 'OUT', todo.filter(t => t.diff < 0).map(mk));
    const nowT = new Date();
    appendRows_(log, todo.map(t => [nowT, txDate, t.code, t.cur.name, t.cur.unit, t.cur.balance, t.target, t.diff, 'นับสต็อก', safeCell_(cntNote), safeCell_(person)]));
    SpreadsheetApp.flush();
    return { success: true, changed: todo.length, same: same, message: 'ปรับ ' + todo.length + ' รายการ ตรงกับระบบ ' + same + ' รายการ' };
  } finally {
    lock.releaseLock();
  }
}

// ===== เพิ่มวัสดุใหม่ =====
// หมายเหตุ: แท็บ "สรุปรายงาน" ใช้ ARRAYFORMULA ดึงรายการจากแท็บ "รายการวัสดุ" อยู่แล้ว
// จึงเพิ่มแถวเฉพาะในแท็บ "รายการวัสดุ" (ห้ามเขียนลงสรุปรายงานตรงๆ เพราะจะชนกับสูตร)

// เสนอรหัสถัดไป จากรูปแบบรหัสที่ใช้มากที่สุด เช่น BK016 -> BK017
function nextCode_(codes) {
  const cnt = {}, maxN = {}, wd = {};
  codes.forEach(c => {
    const m = /^(\D*)(\d+)$/.exec(c);
    if (!m) return;
    cnt[m[1]] = (cnt[m[1]] || 0) + 1;
    maxN[m[1]] = Math.max(maxN[m[1]] || 0, Number(m[2]));
    wd[m[1]] = Math.max(wd[m[1]] || 0, m[2].length);
  });
  const prefixes = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  if (!prefixes.length) return 'M001';
  const p = prefixes[0];
  return p + String(maxN[p] + 1).padStart(wd[p], '0');
}

function getNextCode(bookKey) {
  const sh = getSS(bookKey).getSheetByName('รายการวัสดุ');
  if (!sh) return '';
  const d = sh.getDataRange().getValues();
  return nextCode_(d.slice(1).map(r => String(r[0]).trim()).filter(Boolean));
}

// f = { book, code, name, unit, minStock, openQty, person }
// openQty (ถ้ามี) จะบันทึกเป็นรายการ "รับเข้า" หมายเหตุ [ยอดตั้งต้น]
function addMaterial(f) {
  const ss = getSS(f.book);
  const name = cleanText_(f.name, LIM_.matName, 'ชื่อวัสดุ');
  const unit = cleanText_(f.unit, LIM_.unit, 'หน่วย');
  if (!name) throw new Error('กรุณาระบุชื่อวัสดุ');
  if (!unit) throw new Error('กรุณาระบุหน่วย');
  assertNotFormula_(name, 'ชื่อวัสดุ');
  assertNotFormula_(unit, 'หน่วย');
  assertNotFormula_(cleanText_(f.code, LIM_.code, 'รหัสวัสดุ'), 'รหัสวัสดุ');
  const blank = v => v === '' || v === null || v === undefined;
  const minStock = blank(f.minStock) ? 0 : Number(f.minStock);
  if (!isFinite(minStock) || minStock < 0) throw new Error('ขั้นต่ำต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  const openQty = blank(f.openQty) ? 0 : Number(f.openQty);
  if (!isFinite(openQty) || openQty < 0) throw new Error('ยอดตั้งต้นต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
  const person = cleanText_(f.person, LIM_.person, 'ชื่อผู้ดำเนินการ');
  if (openQty > 0 && !person) throw new Error('กรุณาระบุชื่อผู้ดำเนินการ');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss.getSheetByName('รายการวัสดุ');
    if (!sh) throw new Error('ไม่พบแผ่นงาน "รายการวัสดุ"');
    const data = sh.getDataRange().getValues();
    const codes = data.slice(1).map(r => String(r[0]).trim()).filter(Boolean);
    let code = String(f.code || '').trim() || nextCode_(codes);
    if (codes.some(c => c.toLowerCase() === code.toLowerCase())) throw new Error('รหัส ' + code + ' ถูกใช้แล้ว');
    const dup = data.slice(1).filter(r => String(r[1]).trim().toLowerCase() === name.toLowerCase())[0];
    if (dup) throw new Error('มีวัสดุชื่อ "' + name + '" อยู่แล้ว (รหัส ' + String(dup[0]).trim() + ')');

    // หาแถวว่างแรกจากคอลัมน์ B (ชื่อวัสดุ)
    const scan = Math.min(Math.max(sh.getLastRow() + 5, 50), sh.getMaxRows());
    const colB = sh.getRange(1, 2, scan, 1).getValues();
    let row = sh.getLastRow() + 1;
    for (let i = 1; i < colB.length; i++) {
      if (String(colB[i][0]).trim() === '') { row = i + 1; break; }
    }
    if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());

    try {
      if (sh.getRange(row, 1).getFormula()) {
        sh.getRange(row, 2, 1, 3).setValues([[name, unit, minStock]]);   // คอลัมน์รหัสเป็นสูตร ไม่เขียนทับ
      } else {
        sh.getRange(row, 1, 1, 4).setValues([[code, name, unit, minStock]]);
      }
    } catch (e) {
      throw new Error('เขียนลงชีท "รายการวัสดุ" ไม่ได้ (ถ้าชีทมีตัวกรองค้างอยู่ ให้ล้างตัวกรองก่อน): ' + e.message);
    }
    SpreadsheetApp.flush();
    code = String(sh.getRange(row, 1).getValue()).trim() || code;

    if (openQty > 0) appendTx_(ss, 'IN', parseDateParam_(''), name, openQty, person, '[ยอดตั้งต้น] วัสดุใหม่');
    SpreadsheetApp.flush();

    let inSummary = false;
    try { inSummary = !!readBalances_(ss)[code]; } catch (e) {}
    return {
      success: true, code: code, name: name, warn: !inSummary,
      message: 'เพิ่ม ' + name + ' (' + code + ') เรียบร้อย' +
        (openQty > 0 ? ' พร้อมรับเข้าตั้งต้น ' + openQty + ' ' + unit : '') +
        (inSummary ? '' : ' แต่แท็บ "สรุปรายงาน" ยังไม่แสดงแถวนี้ ตรวจสอบสูตรในแท็บสรุปรายงาน')
    };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 * ใบงานเข้าเล่ม — เพิ่มเป็นไฟล์ใหม่ในโปรเจกต์ Apps Script (ไม่ต้องแก้ Code.gs)
 * ใช้ฟังก์ชันเดิมร่วมกัน: getSS, readBalances_, findMaterial_, appendTx_, parseDateParam_
 *
 * แท็บ "สูตรเข้าเล่ม" (สร้างให้อัตโนมัติถ้ายังไม่มี) คอลัมน์:
 *   A ประเภท | B จากแผ่น | C ถึงแผ่น | D รหัสวัสดุ | E จำนวนต่อเล่ม | F หมายเหตุ
 * ประเภทที่รองรับ:
 *   กระดาษ   - D = รหัสกระดาษ (จำนวนคำนวณจากแผ่น x เล่ม + เผื่อเสีย)
 *   สัน      - B-C = ช่วงแผ่นต่อเล่ม, D = รหัสสัน (เพิ่มได้หลายแถว)
 *   ปกใส / ปกหลัง / ปกอ่อน - D = รหัส, E = จำนวนต่อเล่ม (เพิ่มได้หลายแถว)
 *                (เลือก "ปกใส" ใช้แถวปกใส + ปกหลัง, เลือก "ปกอ่อน" ใช้แถวปกอ่อน)
 *   เผื่อเสีย - E = % เผื่อกระดาษเสีย (ค่าเริ่มต้น)
 * แถวที่ไม่ได้ใส่รหัส จะถูกข้าม
 * ===================================================================== */
const CFG_SHEET_ = 'สูตรเข้าเล่ม';

function ensureBindingCfg_(ss) {
  let sh = ss.getSheetByName(CFG_SHEET_);
  if (sh) return sh;
  sh = ss.insertSheet(CFG_SHEET_);
  const rows = [
    ['ประเภท', 'จากแผ่น', 'ถึงแผ่น', 'รหัสวัสดุ', 'จำนวนต่อเล่ม', 'หมายเหตุ'],
    ['กระดาษ', '', '', '', '', 'ใส่รหัสกระดาษที่ใช้พิมพ์'],
    ['สัน', 1, 50, '', 1, 'สัน 6 มม.'],
    ['สัน', 51, 100, '', 1, 'สัน 10 มม.'],
    ['ปกใส', '', '', '', 1, 'ปกหน้าใส'],
    ['ปกหลัง', '', '', '', 1, 'ใช้คู่กับปกใส'],
    ['ปกอ่อน', '', '', '', 1, 'ถ้าใช้หลายชิ้นต่อเล่ม ให้เพิ่มหลายแถว'],
    ['เผื่อเสีย', '', '', '', 5, '% เผื่อกระดาษเสีย (ค่าเริ่มต้น)']
  ];
  sh.getRange(1, 1, rows.length, 6).setValues(rows);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#ede9fe');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 6);
  return sh;
}

function readBindingCfg_(ss) {
  const data = ensureBindingCfg_(ss).getDataRange().getValues();
  const cfg = { paper: null, spines: [], clear: [], back: [], soft: [], waste: 0 };
  for (let i = 1; i < data.length; i++) {
    const r = data[i], type = String(r[0]).trim(), code = String(r[3] || '').trim();
    const per = r[4] === '' ? 1 : Number(r[4]);
    if (type === 'เผื่อเสีย') { cfg.waste = Number(r[4]) || 0; continue; }
    if (!code) continue;
    if (type === 'กระดาษ') { if (!cfg.paper) cfg.paper = code; }
    else if (type === 'สัน') cfg.spines.push({ from: Number(r[1]) || 0, to: Number(r[2]) || 1e9, code: code });
    else if (type === 'ปกใส') cfg.clear.push({ code: code, per: per });
    else if (type === 'ปกหลัง') cfg.back.push({ code: code, per: per });
    else if (type === 'ปกอ่อน') cfg.soft.push({ code: code, per: per });
  }
  return cfg;
}

// ส่งค่าตั้งต้นให้หน้าเว็บ (รายการสัน + % เผื่อเสีย)
function getBindingConfig(bookKey) {
  const cfg = readBindingCfg_(getSS(bookKey));
  return { spines: cfg.spines, waste: cfg.waste, hasPaper: !!cfg.paper };
}

// คำนวณรายการวัสดุของใบงาน (ใช้ทั้งพรีวิวและบันทึก เพื่อให้ตัวเลขตรงกันเสมอ)
function calcBindingJob_(ss, f) {
  const copies = Math.floor(Number(f.copies)), pages = Math.floor(Number(f.pages));
  if (!(copies > 0)) throw new Error('จำนวนเล่มต้องมากกว่า 0');
  if (!(pages > 0)) throw new Error('จำนวนหน้าต่อเล่มต้องมากกว่า 0');
  const cfg = readBindingCfg_(ss), bal = readBalances_(ss);
  if (!cfg.paper) throw new Error('ยังไม่ได้ตั้งค่ากระดาษ ไปที่เมนู "ตั้งค่าสูตรเข้าเล่ม"');

  const blank = f.waste === '' || f.waste === null || f.waste === undefined;
  const waste = blank ? cfg.waste : Number(f.waste);
  if (!isFinite(waste) || waste < 0) throw new Error('% เผื่อเสียต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');

  const sheetsPerBook = Math.ceil(pages / (f.duplex ? 2 : 1));
  const paperQty = Math.ceil(sheetsPerBook * copies * (1 + waste / 100));

  // สัน 2 โหมด: เลือกเอง (f.spine = รหัสวัสดุใดก็ได้ในคลัง) / อัตโนมัติ (ตามช่วงแผ่นในแท็บสูตรเข้าเล่ม)
  let spine, spineNote;
  if (f.spine) {
    spine = { code: String(f.spine).trim() };
    spineNote = 'เลือกเอง';
  } else {
    spine = cfg.spines.filter(s => sheetsPerBook >= s.from && sheetsPerBook <= s.to)[0];
    if (!spine) throw new Error('ไม่มีสันที่รองรับ ' + sheetsPerBook + ' แผ่น กรุณาเพิ่มช่วงในเมนู "ตั้งค่าสูตรเข้าเล่ม" หรือเปลี่ยนเป็นเลือกสันเอง');
    spineNote = 'อัตโนมัติ ' + spine.from + '–' + (spine.to >= 1e9 ? '∞' : spine.to) + ' แผ่น';
  }

  const covers = f.cover === 'soft' ? cfg.soft : cfg.clear.concat(cfg.back);
  if (!covers.length) throw new Error('ยังไม่ได้ตั้งค่า' + (f.cover === 'soft' ? 'ปกอ่อน' : 'ปกใส/ปกหลัง') + ' ไปที่เมนู "ตั้งค่าสูตรเข้าเล่ม"');

  const raw = [{ role: 'กระดาษ', code: cfg.paper, qty: paperQty }, { role: 'สัน', code: spine.code, qty: copies }]
    .concat(covers.map(c => ({ role: f.cover === 'soft' ? 'ปกอ่อน' : (cfg.back.indexOf(c) >= 0 ? 'ปกหลัง' : 'ปกใส'), code: c.code, qty: Math.ceil(c.per * copies) })));

  // รวมแถวที่รหัสซ้ำกัน
  const merged = {}, lines = [];
  raw.forEach(r => {
    if (merged[r.code]) { merged[r.code].qty += r.qty; merged[r.code].role += ' + ' + r.role; return; }
    const b = bal[r.code];
    if (!b) throw new Error('ไม่พบวัสดุรหัส ' + r.code + ' ในแท็บ "สรุปรายงาน" (ตรวจรหัสในเมนู "ตั้งค่าสูตรเข้าเล่ม")');
    merged[r.code] = { role: r.role, code: r.code, name: b.name, unit: b.unit, qty: r.qty, balance: b.balance };
    lines.push(merged[r.code]);
  });
  lines.forEach(l => { l.short = l.qty > l.balance; l.after = l.balance - l.qty; });
  return { sheetsPerBook: sheetsPerBook, waste: waste, spineNote: spineNote, lines: lines };
}

function previewBindingJob(f) {
  return calcBindingJob_(getSS(f.book), f);
}

// f = { book, project, copies, pages, duplex, cover, spine, waste, date, person, force }
function recordBindingJob(f) {
  const ss = getSS(f.book);
  const project = cleanText_(f.project, LIM_.project, 'ชื่อโครงการ');
  const person = cleanText_(f.person, LIM_.person, 'ชื่อผู้เบิก');
  if (!project) throw new Error('กรุณาระบุชื่อโครงการ / หน่วยงาน');
  if (!person) throw new Error('กรุณาระบุชื่อผู้เบิก');
  const txDate = parseDateParam_(f.date);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const job = calcBindingJob_(ss, f);            // คำนวณซ้ำฝั่งเซิร์ฟเวอร์ ไม่เชื่อตัวเลขจากหน้าเว็บ
    const short = job.lines.filter(l => l.short);
    if (short.length && !f.force) return { success: false, needConfirm: true, short: short };

    // ตรวจทุกรายการก่อนเขียน (ชื่อซ้ำ / ไม่พบรหัส) ถ้าไม่ผ่านจะไม่เขียนอะไรเลย
    const M = loadMaterials_(ss);
    const mats = job.lines.map(l => {
      const m = pickMaterial_(M, l.code);
      if (!m) throw new Error('ไม่พบวัสดุรหัส ' + l.code + ' ในแท็บ "รายการวัสดุ"');
      return m;
    });
    const note = '[ใบงาน] ' + project;
    appendTxBatch_(ss, 'OUT', job.lines.map((l, i) => ({ txDate: txDate, name: mats[i].name, qty: l.qty, person: person, note: note })));
    SpreadsheetApp.flush();
    return { success: true, count: job.lines.length, message: 'บันทึกใบงาน "' + project + '" เบิก ' + job.lines.length + ' รายการเรียบร้อย' };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 * ตั้งค่าสูตรเข้าเล่มจากหน้าเว็บ (แอดมินเท่านั้น)
 * ข้อมูลยังเก็บในแท็บ "สูตรเข้าเล่ม" เหมือนเดิม จึงไม่ต้องแก้ชีทเอง และตัวคำนวณเดิมใช้ต่อได้ทันที
 * ===================================================================== */

// อ่านสูตรทั้งหมดให้หน้าเว็บแก้ไข
function getBindingConfigFull(bookKey) {
  const ss = getSS(bookKey);
  const data = ensureBindingCfg_(ss).getDataRange().getValues();
  const c = { paper: '', waste: 0, spines: [], clear: [], back: [], soft: [] };
  for (let i = 1; i < data.length; i++) {
    const r = data[i], type = String(r[0]).trim(), code = String(r[3] || '').trim();
    if (type === 'เผื่อเสีย') { c.waste = Number(r[4]) || 0; continue; }
    if (!code) continue;
    const per = r[4] === '' ? 1 : (Number(r[4]) || 1);
    if (type === 'กระดาษ') { if (!c.paper) c.paper = code; }
    else if (type === 'สัน') c.spines.push({ from: Number(r[1]) || 1, to: (r[2] === '' || !Number(r[2])) ? '' : Number(r[2]), code: code });
    else if (type === 'ปกใส') c.clear.push({ code: code, per: per });
    else if (type === 'ปกหลัง') c.back.push({ code: code, per: per });
    else if (type === 'ปกอ่อน') c.soft.push({ code: code, per: per });
  }
  c.spines.sort((a, b) => a.from - b.from);
  return c;
}

// f = { book, paper, waste, spines:[{from,to,code}], clear:[{code,per}], back:[...], soft:[...] }
// ตรวจทุกอย่างก่อนเขียน ถ้าไม่ผ่านจะไม่แตะชีทเลย
function saveBindingConfig(f) {
  const ss = getSS(f.book);
  const mats = {};
  getMaterialList(f.book).forEach(m => mats[m.code] = m);
  const code = v => String(v == null ? '' : v).trim();
  const blank = v => v === '' || v === null || v === undefined;
  const need = (c, label) => {
    if (!c) throw new Error(label + ': ยังไม่ได้เลือกวัสดุ');
    if (!mats[c]) throw new Error(label + ': ไม่พบรหัส ' + c + ' ในรายการวัสดุ');
  };

  const paper = code(f.paper);
  need(paper, 'กระดาษ');
  const waste = blank(f.waste) ? 0 : Number(f.waste);
  if (!isFinite(waste) || waste < 0 || waste > 100) throw new Error('% เผื่อเสียต้องอยู่ระหว่าง 0 ถึง 100');

  const spines = (f.spines || []).filter(x => x && (code(x.code) || !blank(x.from) || !blank(x.to))).map((x, i) => {
    const label = 'สัน แถวที่ ' + (i + 1);
    const c = code(x.code); need(c, label);
    const from = Math.floor(Number(x.from));
    if (!(from >= 1)) throw new Error(label + ': "จากแผ่น" ต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป');
    let to = '';
    if (!blank(x.to)) {
      to = Math.floor(Number(x.to));
      if (!(to >= from)) throw new Error(label + ': "ถึงแผ่น" ต้องไม่น้อยกว่า "จากแผ่น"');
    }
    return { from: from, to: to, code: c };
  }).sort((a, b) => a.from - b.from);
  for (let i = 1; i < spines.length; i++) {
    const prev = spines[i - 1];
    if (prev.to === '' || spines[i].from <= prev.to) {
      throw new Error('ช่วงแผ่นของสันทับกัน: ' + prev.from + '–' + (prev.to === '' ? 'ไม่จำกัด' : prev.to) + ' กับ ' + spines[i].from + '–' + (spines[i].to === '' ? 'ไม่จำกัด' : spines[i].to));
    }
  }

  const covers = (list, label) => (list || []).filter(x => x && (code(x.code) || !blank(x.per))).map((x, i) => {
    const l = label + ' แถวที่ ' + (i + 1);
    const c = code(x.code); need(c, l);
    const per = blank(x.per) ? 1 : Number(x.per);
    if (!isFinite(per) || per <= 0) throw new Error(l + ': จำนวนต่อเล่มต้องมากกว่า 0');
    return { code: c, per: per };
  });
  const clear = covers(f.clear, 'ปกใส'), back = covers(f.back, 'ปกหลัง'), soft = covers(f.soft, 'ปกอ่อน');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ensureBindingCfg_(ss);
    // เก็บหมายเหตุเดิมของแต่ละแถวไว้
    const notes = {};
    sh.getDataRange().getValues().slice(1).forEach(r => {
      const n = String(r[5] || '').trim();
      if (n) notes[String(r[0]).trim() + '|' + String(r[3] || '').trim()] = n;
    });
    const note = (t, c, d) => notes[t + '|' + c] || d || '';
    const rows = [['ประเภท', 'จากแผ่น', 'ถึงแผ่น', 'รหัสวัสดุ', 'จำนวนต่อเล่ม', 'หมายเหตุ']];
    rows.push(['กระดาษ', '', '', paper, '', note('กระดาษ', paper, '')]);
    spines.forEach(x => rows.push(['สัน', x.from, x.to, x.code, 1, note('สัน', x.code, '')]));
    clear.forEach(x => rows.push(['ปกใส', '', '', x.code, x.per, note('ปกใส', x.code, '')]));
    back.forEach(x => rows.push(['ปกหลัง', '', '', x.code, x.per, note('ปกหลัง', x.code, '')]));
    soft.forEach(x => rows.push(['ปกอ่อน', '', '', x.code, x.per, note('ปกอ่อน', x.code, '')]));
    rows.push(['เผื่อเสีย', '', '', '', waste, '% เผื่อกระดาษเสีย (ค่าเริ่มต้น)']);
    try {
      sh.clearContents();
      sh.getRange(1, 1, rows.length, 6).setValues(rows);
      sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#ede9fe');
      sh.setFrozenRows(1);
    } catch (e) {
      throw new Error('เขียนลงแท็บ "' + CFG_SHEET_ + '" ไม่ได้ (ถ้าชีทมีตัวกรองค้างอยู่ ให้ล้างตัวกรองก่อน): ' + e.message);
    }
    SpreadsheetApp.flush();
    return { success: true, message: 'บันทึกสูตรเข้าเล่มเรียบร้อย (สัน ' + spines.length + ' ช่วง · ปกใส ' + clear.length + ' · ปกหลัง ' + back.length + ' · ปกอ่อน ' + soft.length + ' รายการ)' };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 * ระบบคำขอเบิก: ผู้ใช้ส่งคำขอ -> แอดมินอนุมัติ/ไม่อนุมัติ -> อนุมัติแล้วจึงตัดสต็อก
 * คำขอเก็บในแท็บ "คำขอเบิก" (สร้างให้อัตโนมัติ) ของแต่ละไฟล์ชีท
 * อีเมลรับแจ้งเตือน (NOTIFY_EMAIL) และลิงก์เว็บ (WEB_URL) ตั้งได้จากหน้าเว็บ เมนู "ตั้งค่า" 
 * ===================================================================== */
const REQ_SHEET_ = 'คำขอเบิก';
const REQ_HEAD_ = ['เลขที่คำขอ', 'เวลาที่ขอ', 'วันที่เบิก', 'รหัส', 'ชื่อวัสดุ', 'หน่วย', 'จำนวน', 'ผู้เบิก', 'หมายเหตุ', 'สถานะ', 'เวลาพิจารณา', 'เหตุผล/หมายเหตุแอดมิน', 'ประเภท'];
const TZ_ = APP_CONFIG.timezone;
const REQ_PER_HOUR_ = APP_CONFIG.reqPerHour;   // เพดานจำนวนคำขอ (เบิก+คืน) ต่อชั่วโมง "ต่อคน" ต่อไฟล์ชีท ปรับตัวเลขนี้ได้
const ST_WAIT_ = 'รออนุมัติ', ST_OK_ = 'อนุมัติ', ST_NO_ = 'ไม่อนุมัติ';

function fmtDT_(v, p) { return v instanceof Date ? Utilities.formatDate(v, TZ_, p) : String(v == null ? '' : v); }

function ensureReqSheet_(ss) {
  let sh = ss.getSheetByName(REQ_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(REQ_SHEET_);
    sh.getRange(1, 1, 1, REQ_HEAD_.length).setValues([REQ_HEAD_]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    // ชีทเก่าที่ยังไม่มีคอลัมน์ "ประเภท" (เบิก/คืน) -> เติมให้อัตโนมัติ
    if (sh.getMaxColumns() < REQ_HEAD_.length) sh.insertColumnsAfter(sh.getMaxColumns(), REQ_HEAD_.length - sh.getMaxColumns());
    const hc = sh.getRange(1, REQ_HEAD_.length);
    if (hc.getValue() === '') hc.setValue(REQ_HEAD_[REQ_HEAD_.length - 1]).setFontWeight('bold');
  }
  return sh;
}
// จำนวนคอลัมน์ที่อ่านได้จริง (ชีทเก่าอาจยังไม่มีคอลัมน์ประเภท)
function reqCols_(sh) { return Math.min(sh.getMaxColumns(), REQ_HEAD_.length); }

// ยอดที่ "ชื่อนี้" คืนได้ต่อวัสดุ (ชื่อวัสดุ -> จำนวน) = เบิกจ่ายแล้ว - คืนเบิกแล้ว - คำขอคืนที่ยังรออนุมัติ (ตรวจฝั่งเซิร์ฟเวอร์ กันการส่งข้ามหน้าเว็บ)
// แบ่งเป็น 2 ส่วน: ส่วนหนัก (อ่านประวัติ) ทำก่อนถือล็อกได้ ส่วนเบา (คำขอคืนที่ค้าง) ทำในล็อกเพื่อให้ถูกต้องเสมอ
const normSpace_ = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); };
function returnableBase_(ss, person) {
  const key = normSpace_(person), w = {}; w[key] = true;
  const sh = function (n) { const x = ss.getSheetByName(n); return x ? x.getLastRow() : 0; };
  return { left: netIndex_(ss, normSpace_, w)[key].byName, rowsOut: sh('เบิก'), rowsIn: sh('รับเข้า') };
}
function returnableByName_(ss, bookKey, person, base) {
  const key = normSpace_(person);
  const sh = function (n) { const x = ss.getSheetByName(n); return x ? x.getLastRow() : 0; };
  // ถ้าระหว่างที่คำนวณมีการเขียนเข้าชีทเบิก/รับเข้า (จำนวนแถวเปลี่ยน) ให้คำนวณใหม่ในล็อก
  if (!base || base.rowsOut !== sh('เบิก') || base.rowsIn !== sh('รับเข้า')) base = returnableBase_(ss, person);
  const left = {};
  Object.keys(base.left).forEach(function (n) { left[n] = base.left[n]; });
  readRequestGroups_(ss).forEach(function (g) {
    if (normSpace_(g.person) !== key || g.kind !== 'คืน' || g.status !== ST_WAIT_) return;
    g.items.forEach(function (it) { left[it.name] = (left[it.name] || 0) - (Number(it.qty) || 0); });
  });
  return left;
}

// ผู้ใช้ทั่วไปส่งคำขอเบิก (ยังไม่ตัดสต็อก) — เบิกได้หลายรายการในคำขอเดียว
// f = { book, txDate, personName, note, items: [{ code, qty }] }  (รองรับแบบเดิม: materialCode + quantity)
// แต่ละรายการเขียนเป็น 1 แถวในแท็บ "คำขอเบิก" โดยใช้เลขที่คำขอเดียวกัน
function submitReqCore_(f, kind) {
  const ss = getSS(f.book);
  const person = cleanText_(f.personName, LIM_.person, kind === 'คืน' ? 'ชื่อผู้คืน' : 'ชื่อผู้เบิก');
  if (!person) throw new Error(kind === 'คืน' ? 'กรุณาระบุชื่อผู้คืน' : 'กรุณาระบุชื่อผู้เบิก');
  const txDate = parseDateParam_(f.txDate);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const note = cleanText_(f.note, LIM_.note, 'หมายเหตุ');

  let raw = Array.isArray(f.items) && f.items.length ? f.items : [{ code: f.materialCode, qty: f.quantity }];
  if (raw.length > 50) throw new Error((kind === 'คืน' ? 'ขอคืน' : 'ขอเบิก') + 'ได้ไม่เกิน 50 รายการต่อครั้ง');
  // รวมรายการที่เป็นวัสดุเดียวกัน
  const merged = {}, order = [];
  raw.forEach(function (x) {
    const code = String(x.code || x.materialCode || '').trim();
    const qty = Number(x.qty != null ? x.qty : x.quantity);
    if (!code) throw new Error('มีรายการที่ยังไม่ได้เลือกวัสดุ');
    if (!isFinite(qty) || qty <= 0) throw new Error('จำนวนต้องเป็นตัวเลขมากกว่า 0 (รหัส ' + code + ')');
    if (!(code in merged)) { merged[code] = 0; order.push(code); }
    merged[code] += qty;
  });

  // คำขอคืน: ส่วนที่ต้องอ่านประวัติเยอะ ทำก่อนถือล็อก คนอื่นจะไม่ต้องรอ (ในล็อกตรวจซ้ำเฉพาะส่วนที่อาจเปลี่ยน)
  const retBase = kind === 'คืน' ? returnableBase_(ss, person) : null;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id; const items = [];
  try {
    const M = loadMaterials_(ss);
    order.forEach(function (code) {
      const mat = pickMaterial_(M, code);
      if (!mat) throw new Error('ไม่พบวัสดุรหัส ' + code);
      items.push({ mat: mat, qty: merged[code] });
    });
    // คำขอคืน: ต้องมีประวัติเบิกในชื่อนี้ และห้ามคืนเกินยอดที่เบิกไว้ (ตรวจตามเอกสารประวัติ)
    if (kind === 'คืน') {
      const left = returnableByName_(ss, f.book, person, retBase), r6 = n => Math.round(n * 1e6) / 1e6;
      const noHist = items.filter(function (it) { return !(left[it.mat.name] > 0); });
      if (noHist.length) throw new Error('ไม่สามารถคืนได้: ชื่อ "' + person + '" ไม่มีประวัติการเบิก (หรือคืนครบแล้ว) ของ ' + noHist.map(function (it) { return it.mat.name; }).join(', ') + ' กรุณาตรวจชื่อผู้คืนให้ตรงกับชื่อที่เบิก');
      const over = items.filter(function (it) { return r6(it.qty) > r6(left[it.mat.name]); });
      if (over.length) throw new Error('คืนเกินที่เบิกไว้: ' + over.map(function (it) { return it.mat.name + ' (คืนได้สูงสุด ' + r6(left[it.mat.name]) + ' ' + it.mat.unit + ')'; }).join(', '));
    }
    const sh = ensureReqSheet_(ss);
    const now = new Date();
    // เพดานคำขอรวมทั้งระบบต่อชั่วโมงต่อชีท (กันสแปม) นับเป็น "คำขอ" ไม่ใช่จำนวนแถว
    const cache = CacheService.getScriptCache();
    const rateKey = 'req_cnt_' + String(f.book || '') + '_' + hash_(normSpace_(person)) + '_' + Utilities.formatDate(now, TZ_, 'yyMMddHH');
    const sent = Number(cache.get(rateKey) || 0);
    if (sent >= REQ_PER_HOUR_) throw new Error('คุณส่งคำขอถี่เกินกำหนด (เกิน ' + REQ_PER_HOUR_ + ' คำขอต่อชั่วโมง) กรุณารอสักครู่แล้วลองใหม่ หรือแจ้งแอดมินโดยตรง');
    // เลขที่คำขอ: เวลา + รหัสสุ่ม 6 หลัก (ไม่ชนกันแม้ส่งพร้อมกันในวินาทีเดียว)
    id = (kind === 'คืน' ? 'T' : 'R') + Utilities.formatDate(now, TZ_, 'yyMMdd-HHmmss') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
    const rows = items.map(function (it) {
      return [id, now, txDate, it.mat.code, it.mat.name, it.mat.unit, it.qty, safeCell_(person), safeCell_(note), ST_WAIT_, '', '', kind];
    });
    cache.put(rateKey, String(sent + 1), 7200);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, REQ_HEAD_.length).setValues(rows);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  notifyAdmin_(f.book, id, items, person, note, txDate, ss, kind);
  return { success: true, id: id, kind: kind, message: kind === 'คืน'
    ? 'ส่งคำขอคืน ' + items.length + ' รายการเรียบร้อย เลขที่ ' + id + ' รอแอดมินอนุมัติ ยอดคงเหลือจะเพิ่มเมื่อได้รับอนุมัติ'
    : 'ส่งคำขอ ' + items.length + ' รายการเรียบร้อย เลขที่ ' + id + ' รอแอดมินอนุมัติ สต็อกจะถูกตัดเมื่อได้รับอนุมัติ' };
}

function submitRequest(f) { return submitReqCore_(f, 'เบิก'); }
// พนักงานขอคืนของ (ยังไม่เพิ่มสต็อก) f = { book, txDate, personName, note, items: [{ code, qty }] }
function submitReturnRequest(f) { return submitReqCore_(f, 'คืน'); }

/* ---------- อีเมลแจ้งเตือนแบบสวย (HTML) ---------- */
function esc_(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// i = { id, person, book, txDate, note, link, items: [{ code, name, unit, qty, balance }] }
function reqEmailSubject_(i) {
  const n = i.items.length, v = i.kind === 'คืน' ? 'คืน' : 'เบิก';
  return '[ขอ' + v + 'วัสดุ] ' + i.person + ' ขอ' + v + ' ' + (n === 1 ? i.items[0].name + ' ' + i.items[0].qty + ' ' + i.items[0].unit : n + ' รายการ');
}

function reqEmailText_(i) {
  const v = i.kind === 'คืน' ? 'คืน' : 'เบิก';
  return [
    'มีคำขอ' + v + 'วัสดุใหม่ รอการอนุมัติ', '',
    'เลขที่คำขอ : ' + i.id,
    'ชีท        : ' + i.book,
    'ผู้' + v + '     : ' + i.person,
    'วันที่' + (v === 'คืน' ? 'คืน' : 'ต้องการ') + ' : ' + i.txDate,
    'หมายเหตุ  : ' + (i.note || '-'), '',
    'รายการ (' + i.items.length + '):'
  ].concat(i.items.map(function (x, k) {
    return (k + 1) + '. ' + x.name + ' (' + x.code + ')  ' + x.qty + ' ' + x.unit + (v === 'คืน' ? '' : '  [คงเหลือ ' + (x.balance == null ? '-' : x.balance) + ']');
  })).concat(['', i.link ? 'เปิดหน้าเว็บเพื่ออนุมัติ: ' + i.link : 'เข้าหน้าเว็บ > โหมดแอดมิน > เมนู "คำขอเบิก/คืน" เพื่ออนุมัติ']).join('\n');
}

function reqEmailHtml_(i) {
  const ret = i.kind === 'คืน', v = ret ? 'คืน' : 'เบิก';
  const initial = esc_(String(i.person || '?').trim().charAt(0).toUpperCase());
  const rows = i.items.map(function (x, k) {
    const over = !ret && x.balance != null && x.qty > x.balance;
    return '<tr>' +
      '<td style="padding:14px 16px;border-bottom:1px solid #eeeaff;">' +
        '<div style="font-size:15px;font-weight:600;color:#1e293b;">' + (k + 1) + '. ' + esc_(x.name) + '</div>' +
        '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">รหัส ' + esc_(x.code) + (ret ? '' : ' · คงเหลือ ' + (x.balance == null ? '-' : esc_(x.balance)) + ' ' + esc_(x.unit)) +
        (over ? ' <b style="color:#e11d48;">(เกินยอดคงเหลือ)</b>' : '') + '</div>' +
      '</td>' +
      '<td align="right" style="padding:14px 16px;border-bottom:1px solid #eeeaff;white-space:nowrap;">' +
        '<span style="display:inline-block;background:#f43f5e;background-image:linear-gradient(135deg,#fb923c,#f43f5e);color:#ffffff;border-radius:999px;padding:6px 16px;font-size:18px;font-weight:700;">' +
          esc_(x.qty) + ' <span style="font-size:12px;font-weight:500;">' + esc_(x.unit) + '</span></span>' +
      '</td></tr>';
  }).join('');

  const meta = [[ret ? '📅 วันที่คืน' : '📅 วันที่ต้องการ', i.txDate], ['🗂️ ชีท', i.book]];
  if (i.note) meta.push(['📝 หมายเหตุ', i.note]);
  const metaHtml = meta.map(function (m) {
    return '<tr><td style="padding:4px 0;font-size:13px;color:#64748b;width:130px;">' + m[0] + '</td>' +
           '<td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:500;">' + esc_(m[1]) + '</td></tr>';
  }).join('');

  return '<div style="background:#f3f2fb;padding:24px 12px;font-family:Prompt,Tahoma,Arial,sans-serif;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e4e0fa;">' +
    '<tr><td style="background:#6d5ce8;background-image:linear-gradient(120deg,#6d5ce8,#8b5cf6);padding:22px 24px;">' +
      '<div style="font-size:12px;color:#e0d9ff;letter-spacing:.06em;">' + esc_(APP_CONFIG.appName) + '</div>' +
      '<div style="font-size:22px;font-weight:700;color:#ffffff;margin-top:4px;">' + (ret ? '↩️ มีคำขอคืนใหม่ รออนุมัติ' : '📦 มีคำขอเบิกใหม่ รออนุมัติ') + '</div>' +
    '</td></tr>' +
    '<tr><td style="padding:22px 24px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="width:52px;"><div style="width:48px;height:48px;line-height:48px;border-radius:50%;background:#6366f1;background-image:linear-gradient(135deg,#8b5cf6,#4f46e5);color:#ffffff;text-align:center;font-size:20px;font-weight:700;">' + initial + '</div></td>' +
      '<td style="padding-left:12px;"><div style="font-size:12px;color:#94a3b8;">ผู้ขอ' + v + '</div><div style="font-size:20px;font-weight:700;color:#0f172a;">' + esc_(i.person) + '</div></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:8px 24px 0;">' +
      '<div style="font-size:12px;font-weight:600;color:#6d28d9;margin:8px 0;">รายการที่ขอ' + v + ' (' + i.items.length + ' รายการ)</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border:1px solid #ece9fb;border-radius:14px;">' + rows + '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:14px 24px 0;"><table role="presentation" cellpadding="0" cellspacing="0">' + metaHtml + '</table></td></tr>' +
    (i.link ? '<tr><td align="center" style="padding:24px;"><a href="' + esc_(i.link) + '" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;padding:13px 34px;">ตรวจสอบและอนุมัติ →</a></td></tr>' : '<tr><td style="height:20px;"></td></tr>') +
    '<tr><td style="background:#faf9ff;border-top:1px solid #eeeaff;padding:12px 24px;font-size:11px;color:#94a3b8;">รหัสคำขอ ' + esc_(i.id) + ' · อีเมลนี้ส่งอัตโนมัติจากระบบ</td></tr>' +
  '</table></div>';
}

// แจ้งเตือนแอดมินทางอีเมล (ถ้าส่งไม่ได้ คำขอก็ยังถูกบันทึกอยู่ ไม่ทำให้ผู้ใช้ติดขัด)
// items = [{ mat: {code,name,unit}, qty }]
/* ===== แจ้งเตือน LINE (Messaging API: push ถึงแอดมินคนเดียว) =====
 * ตั้งค่า LINE_TOKEN (Channel access token) และ LINE_USER_ID ได้จากหน้าเว็บ เมนู "ตั้งค่า"
 * แผนฟรี 300 ข้อความ/เดือน: หยุดส่งที่ LINE_STOP_AT_ (เผื่อไว้) แล้วสลับไปส่งเมลแทนอัตโนมัติ */
const LINE_MONTH_LIMIT_ = 300, LINE_STOP_AT_ = 290, LINE_WARN_AT_ = 250;

// เปิด/ปิดการส่ง LINE (ตั้งจากเมนู "ตั้งค่า") และช่วงเวลารวมคำขอเป็นการ์ดเดียว (วินาที, 0 = ไม่รวม ส่งทันทีทุกคำขอ)
const LINE_BATCH_DEFAULT_SEC_ = 60;
function lineEnabled_(p) { return (p || PropertiesService.getScriptProperties()).getProperty('LINE_OFF') !== '1'; }
function lineBatchSec_(p) {
  const v = (p || PropertiesService.getScriptProperties()).getProperty('LINE_BATCH_SEC');
  if (v === null || v === '') return LINE_BATCH_DEFAULT_SEC_;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 600) : LINE_BATCH_DEFAULT_SEC_;
}

function lineMonthKey_() { return 'LINE_CNT_' + Utilities.formatDate(new Date(), TZ_, 'yyyyMM'); }

function lineStatus_(p) {
  p = p || PropertiesService.getScriptProperties();
  const used = Number(p.getProperty(lineMonthKey_()) || 0);
  const configured = !!(p.getProperty('LINE_TOKEN') && p.getProperty('LINE_USER_ID'));
  return { configured: configured, enabled: lineEnabled_(p), used: used, limit: LINE_MONTH_LIMIT_, stopAt: LINE_STOP_AT_, near: configured && used >= LINE_WARN_AT_, full: configured && used >= LINE_STOP_AT_ };
}

// ส่งเข้า LINE ถึงแอดมิน/กลุ่ม  msg = ข้อความล้วน (ใช้กับปุ่มทดสอบ) | info ของคำขอเดียว | อาร์เรย์ของ info (รวมหลายคำขอเป็นการ์ดเดียว)
// ไม่ว่าจะกี่คำขอ ส่งเป็น Flex 1 ข้อความ = ใช้โควตา 1 ข้อความ
// คืน { ok, reason, plain }  plain = true เมื่อ Flex ถูก LINE ปฏิเสธ แล้วระบบส่งแบบข้อความล้วนแทนสำเร็จ
function pushLine_(msg) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('LINE_TOKEN'), uid = p.getProperty('LINE_USER_ID');
  if (!token || !uid) return { ok: false, reason: 'ยังไม่ได้ตั้งค่า LINE' };
  const key = lineMonthKey_(), used = Number(p.getProperty(key) || 0);
  if (used >= LINE_STOP_AT_) return { ok: false, reason: 'โควตา LINE เดือนนี้ใกล้หมด (' + used + '/' + LINE_MONTH_LIMIT_ + ')' };

  const isText = typeof msg === 'string';
  const many = Array.isArray(msg) && msg.length > 1;
  const one = Array.isArray(msg) ? msg[0] : msg;
  const flex = isText ? createSimpleFlex_(msg) : many ? createDigestFlex_(msg) : createReqFlex_(one);
  let r = linePost_(token, uid, [flex]);
  let plain = false;
  // Flex ผิดรูปแบบ (400) -> ลองส่งเป็นข้อความล้วน จะได้ไม่พลาดแจ้งเตือน (ข้อผิดพลาดอื่น เช่น token ผิด/โควตา ส่งซ้ำไม่ช่วย)
  if (!r.ok && r.code === 400 && !isText) {
    const txt = many ? lineDigestText_(msg) : lineText_(one);
    const r2 = linePost_(token, uid, [{ type: 'text', text: txt.slice(0, 4500) }]);
    if (r2.ok) { plain = true; r = r2; r.flexErr = 'Flex ถูกปฏิเสธ: ' + String(r.body || '').slice(0, 120); }
  }
  if (r.ok) { p.setProperty(key, String(used + 1)); return { ok: true, plain: plain, reason: r.flexErr || '' }; }
  return { ok: false, reason: 'LINE ตอบ ' + r.code + ': ' + String(r.body || '').slice(0, 150) };
}

function linePost_(token, uid, messages) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: uid, messages: messages })
  });
  const code = res.getResponseCode();
  return { ok: code === 200, code: code, body: res.getContentText() };
}

function lineText_(i) {
  const lines = ['🔔 คำขอ' + i.kind + 'ใหม่ ' + i.id, 'ผู้ขอ: ' + i.person, 'ชีท: ' + i.book, 'วันที่' + i.kind + ': ' + i.txDate];
  i.items.slice(0, 8).forEach(function (x, k) {
    lines.push((k + 1) + '. ' + x.name + ' × ' + x.qty + ' ' + x.unit + (x.balance != null ? ' (คงเหลือ ' + x.balance + ')' : ''));
  });
  if (i.items.length > 8) lines.push('...และอีก ' + (i.items.length - 8) + ' รายการ');
  if (i.note) lines.push('หมายเหตุ: ' + i.note);
  if (i.link) lines.push(i.link);
  return lines.join('\n');
}

/* ===== LINE Flex Message ===== */
// ข้อความใน Flex ห้ามว่าง และควรจำกัดความยาว
function fx_(v, max, dflt) {
  let t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!t) t = dflt == null ? '-' : dflt;
  return max && t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// การ์ดคำขอเบิก/คืน: ขอเบิก = โทนส้มแดง, ขอคืน = โทนเขียวมรกต (ตรงกับปุ่มหน้าเว็บ)
function createReqFlex_(i) {
  const isReturn = i.kind === 'คืน';
  const headerColor = isReturn ? '#0D9488' : '#FF5E62';
  const titleText = isReturn ? '🔄 คำขอคืนวัสดุใหม่' : '📦 คำขอเบิกวัสดุใหม่';
  const items = i.items || [];

  const itemRows = items.slice(0, 10).map(function (x, k) {
    const over = !isReturn && x.balance != null && x.qty > x.balance;
    return {
      type: 'box', layout: 'vertical', margin: 'md',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: fx_((k + 1) + '. ' + x.name, 80), weight: 'bold', size: 'sm', color: '#1E293B', flex: 4, wrap: true },
          { type: 'text', text: fx_(x.qty + ' ' + (x.unit || ''), 30), weight: 'bold', size: 'sm', color: '#0F172A', align: 'end', flex: 2, wrap: true }
        ] },
        { type: 'text', text: fx_('รหัส: ' + x.code + (x.balance != null ? ' | คงเหลือ: ' + x.balance : '') + (over ? ' (เกินยอดคงเหลือ)' : ''), 80),
          size: 'xs', color: over ? '#EF4444' : '#64748B', weight: over ? 'bold' : 'regular', wrap: true }
      ]
    };
  });
  if (items.length > 10) itemRows.push({ type: 'text', text: '...และอีก ' + (items.length - 10) + ' รายการ', size: 'xs', color: '#94A3B8', margin: 'sm' });

  const infoRow = function (label, value) {
    return { type: 'box', layout: 'horizontal', contents: [
      { type: 'text', text: label, size: 'xs', color: '#64748B', flex: 2 },
      { type: 'text', text: fx_(value, 120), size: 'xs', color: '#0F172A', flex: 5, wrap: true, weight: label.indexOf('ผู้ขอ') === 0 ? 'bold' : 'regular' }
    ] };
  };
  const info = [infoRow('ผู้ขอ' + (i.kind || 'เบิก'), i.person), infoRow('ชีท', i.book), infoRow('วันที่' + (i.kind || 'เบิก'), i.txDate)];
  if (i.note) info.push(infoRow('หมายเหตุ', i.note));

  const bubble = {
    type: 'bubble',
    header: { type: 'box', layout: 'vertical', backgroundColor: headerColor, paddingAll: 'lg', contents: [
      { type: 'text', text: titleText, weight: 'bold', color: '#FFFFFF', size: 'md' },
      { type: 'text', text: 'เลขที่คำขอ: ' + fx_(i.id, 40), color: '#FFFFFFCC', size: 'xs', margin: 'xs' }
    ] },
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'box', layout: 'vertical', spacing: 'sm', contents: info },
      { type: 'separator', margin: 'lg' },
      { type: 'text', text: 'รายการวัสดุ (' + items.length + ' รายการ)', weight: 'bold', size: 'xs', color: '#475569', margin: 'lg' },
      { type: 'box', layout: 'vertical', margin: 'xs', contents: itemRows.length ? itemRows : [{ type: 'text', text: '-', size: 'xs' }] }
    ] }
  };
  // ปุ่มเปิดหน้าเว็บ: LINE รับเฉพาะลิงก์ http(s) ที่ถูกต้อง ถ้าลิงก์ผิดรูปแบบจะไม่ใส่ปุ่ม (ไม่งั้นทั้งการ์ดถูกปฏิเสธ)
  if (/^https?:\/\/\S+$/i.test(String(i.link || '')) && String(i.link).length <= 1000) {
    bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
      { type: 'button', style: 'primary', color: headerColor, height: 'sm', action: { type: 'uri', label: 'เปิดหน้าเว็บเพื่ออนุมัติ', uri: String(i.link) } }
    ] };
  }
  return { type: 'flex', altText: (titleText + ' ' + fx_(i.id, 40)).slice(0, 380), contents: bubble };
}

function lineDigestText_(list) {
  return ['📬 คำขอใหม่ ' + list.length + ' รายการ'].concat(list.map(function (i) { return lineText_(i); })).join('\n\n');
}

// การ์ดเดียวรวมหลายคำขอ: แต่ละคำขอเป็นบล็อกสั้นๆ (ผู้ขอ + รายการ) ขอเบิก = โทนส้มแดง, ขอคืน = โทนเขียวมรกต
function createDigestFlex_(list) {
  const MAXR = 8, MAXI = 4;
  const nOut = list.filter(function (i) { return i.kind !== 'คืน'; }).length, nRet = list.length - nOut;
  const parts = [];
  list.slice(0, MAXR).forEach(function (i, k) {
    const isRet = i.kind === 'คืน', col = isRet ? '#0D9488' : '#FF5E62', items = i.items || [];
    const over = !isRet && items.some(function (x) { return x.balance != null && x.qty > x.balance; });
    const lines = items.slice(0, MAXI).map(function (x) {
      return { type: 'text', text: fx_('• ' + x.name + ' × ' + x.qty + ' ' + (x.unit || ''), 80), size: 'xs', color: '#334155', wrap: true };
    });
    if (items.length > MAXI) lines.push({ type: 'text', text: '+ อีก ' + (items.length - MAXI) + ' รายการ', size: 'xs', color: '#94A3B8' });
    if (over) lines.push({ type: 'text', text: '⚠️ มีรายการเกินยอดคงเหลือ', size: 'xs', color: '#EF4444', weight: 'bold' });
    if (i.note) lines.push({ type: 'text', text: fx_('หมายเหตุ: ' + i.note, 80), size: 'xs', color: '#64748B', wrap: true });
    if (k > 0) parts.push({ type: 'separator', margin: 'lg' });
    parts.push({ type: 'box', layout: 'vertical', margin: k > 0 ? 'lg' : 'none', spacing: 'xs', contents: [
      { type: 'text', text: (isRet ? '↩️ ขอคืน · ' : '📦 ขอเบิก · ') + fx_(i.person, 40), weight: 'bold', size: 'sm', color: col, wrap: true },
      { type: 'text', text: fx_(i.id + ' · ' + i.book + ' · ' + i.txDate, 90), size: 'xxs', color: '#94A3B8', wrap: true }
    ].concat(lines) });
  });
  if (list.length > MAXR) parts.push({ type: 'text', text: '...และอีก ' + (list.length - MAXR) + ' คำขอ เปิดหน้าเว็บเพื่อดูทั้งหมด', size: 'xs', color: '#94A3B8', margin: 'lg', wrap: true });

  const summary = (nOut ? 'เบิก ' + nOut : '') + (nOut && nRet ? ' · ' : '') + (nRet ? 'คืน ' + nRet : '');
  const bubble = {
    type: 'bubble',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#6D5CE8', paddingAll: 'lg', contents: [
      { type: 'text', text: '📬 คำขอใหม่ ' + list.length + ' รายการ', weight: 'bold', color: '#FFFFFF', size: 'md' },
      { type: 'text', text: summary, color: '#FFFFFFCC', size: 'xs', margin: 'xs' }
    ] },
    body: { type: 'box', layout: 'vertical', contents: parts }
  };
  const link = String((list[0] && list[0].link) || '');
  if (/^https?:\/\/\S+$/i.test(link) && link.length <= 1000) {
    bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
      { type: 'button', style: 'primary', color: '#6D5CE8', height: 'sm', action: { type: 'uri', label: 'เปิดหน้าเว็บเพื่ออนุมัติ', uri: link } }
    ] };
  }
  return { type: 'flex', altText: ('มีคำขอใหม่ ' + list.length + ' รายการ (' + summary + ')').slice(0, 380), contents: bubble };
}

// การ์ดข้อความทั่วไป (ใช้กับปุ่มทดสอบ LINE)
function createSimpleFlex_(text) {
  return {
    type: 'flex', altText: fx_(text, 200, 'แจ้งเตือน' + APP_CONFIG.appName),
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: '🔔 แจ้งเตือนระบบ', weight: 'bold', size: 'md', color: '#FF5E62' },
      { type: 'text', text: String(text == null ? '' : text).trim().slice(0, 1500) || '-', margin: 'md', size: 'sm', color: '#334155', wrap: true }
    ] } }
  };
}

// ทดสอบการ์ดคำขอจริงของ Flex: เลือกฟังก์ชันนี้ใน Apps Script แล้วกด Run (นับเป็น 1 ข้อความในโควตา LINE)
function testFlexRequest() {
  const r = pushLine_({
    id: 'R-TEST-001', kind: 'เบิก', person: 'ทดสอบ', book: 'วัสดุเข้าเล่ม', note: 'ข้อความทดสอบการ์ด', txDate: '23/10/2026',
    link: PropertiesService.getScriptProperties().getProperty('WEB_URL') || '',
    items: [{ code: 'A3', name: 'ปกใส A3', unit: 'แผ่น', qty: 2, balance: 5 }, { code: 'S8', name: 'สันกระดูกงู 8 mm.', unit: 'เส้น', qty: 1, balance: 0 }]
  });
  Logger.log(JSON.stringify(r));
}

// ทดสอบการ์ดรวมหลายคำขอ: เลือกฟังก์ชันนี้ใน Apps Script แล้วกด Run (นับเป็น 1 ข้อความในโควตา LINE)
function testFlexDigest() {
  const link = PropertiesService.getScriptProperties().getProperty('WEB_URL') || '';
  const r = pushLine_([
    { id: 'R-TEST-001', kind: 'เบิก', person: 'สมชาย', book: 'วัสดุสิ้นเปลือง', note: '', txDate: '23/10/2026', link: link, items: [{ code: 'A3', name: 'ปากกาลูกลื่น', unit: 'ด้าม', qty: 5, balance: 20 }, { code: 'S8', name: 'กระดาษ A4', unit: 'รีม', qty: 3, balance: 1 }] },
    { id: 'T-TEST-002', kind: 'คืน', person: 'สมหญิง', book: 'วัสดุสิ้นเปลือง', note: 'ใช้ไม่หมด', txDate: '23/10/2026', link: link, items: [{ code: 'A3', name: 'ปากกาลูกลื่น', unit: 'ด้าม', qty: 2, balance: 20 }] }
  ]);
  Logger.log(JSON.stringify(r));
}

/* ===== รวมคำขอที่เข้ามาใกล้กันเป็นการ์ด LINE เดียว (ประหยัดโควตา) =====
 * คำขอแรกส่งทันที ถ้ามีคำขออื่นเข้ามาภายใน LINE_BATCH_SEC วินาทีหลังการส่งล่าสุด จะเก็บเข้าคิว
 * แล้วส่งรวมเป็นการ์ดเดียว (1 ข้อความ) เมื่อครบช่วง โดยตัวตั้งเวลา flushNotifyQueue
 * เมลสำรองยังทำงานเหมือนเดิม: ถ้า LINE ส่งไม่สำเร็จ จะส่งเมลแยกรายคำขอ */
function qKey_(id) { return 'NQ_' + id; }
function qIndex_(p) { try { return JSON.parse(p.getProperty('NQ_IDX') || '[]'); } catch (e) { return []; } }

function enqueueNotify_(p, info) {
  const copy = JSON.parse(JSON.stringify(info));
  while (JSON.stringify(copy).length > 8000 && copy.items.length > 1) copy.items.pop();   // ค่าคุณสมบัติหนึ่งตัวเก็บได้ ~9KB
  const idx = qIndex_(p);
  if (!idx.length) p.setProperty('NQ_AT', String(Date.now()));
  p.setProperty(qKey_(info.id), JSON.stringify(copy));
  idx.push(info.id);
  p.setProperty('NQ_IDX', JSON.stringify(idx));
}

function scheduleFlush_(ms) {
  try {
    const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'flushNotifyQueue'; });
    if (!has) ScriptApp.newTrigger('flushNotifyQueue').timeBased().after(Math.max(ms, 5000)).create();
    return true;
  } catch (e) { console.error('scheduleFlush_ failed: ' + e); return false; }
}
function clearFlushTriggers_() {
  try { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'flushNotifyQueue') ScriptApp.deleteTrigger(t); }); } catch (e) {}
}

// ส่งคิวทั้งหมดเป็นการ์ดเดียว (ผู้เรียกต้องถือ ScriptLock อยู่แล้ว)
function flushQueueLocked_() {
  const p = PropertiesService.getScriptProperties();
  const idx = qIndex_(p);
  if (!idx.length) return null;
  const list = idx.map(function (id) { try { return JSON.parse(p.getProperty(qKey_(id))); } catch (e) { return null; } }).filter(Boolean);
  idx.forEach(function (id) { p.deleteProperty(qKey_(id)); });
  p.deleteProperty('NQ_IDX'); p.deleteProperty('NQ_AT');
  if (!list.length) return null;
  let r;
  try { r = pushLine_(list.length === 1 ? list[0] : list); } catch (e) { r = { ok: false, reason: String(e) }; }
  p.setProperty('LINE_LAST_AT', String(Date.now()));
  const ts = Utilities.formatDate(new Date(), TZ_, 'dd/MM/yyyy HH:mm:ss');
  p.setProperty('LINE_LOG', ts + ' | ' + (r.ok ? 'ส่งการ์ดรวม ' + list.length + ' คำขอ สำเร็จ' + (r.reason ? ' (' + r.reason + ')' : '') : 'การ์ดรวม ' + list.length + ' คำขอไม่สำเร็จ: ' + r.reason));
  // LINE ล้มเหลว -> เมลสำรองแยกรายคำขอ (ถ้าเปิด "ส่งเมลทุกครั้ง" เมลถูกส่งไปแล้วตอนเข้าคิว จึงไม่ส่งซ้ำ)
  if (!r.ok && p.getProperty('ALWAYS_EMAIL') !== '1') list.forEach(function (info) { sendMailFor_(info, false, ts); });
  return r;
}

// ตัวตั้งเวลาเรียกฟังก์ชันนี้ (ไม่ต้องเรียกเอง)
function flushNotifyQueue() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { clearFlushTriggers_(); flushQueueLocked_(); } finally { lock.releaseLock(); }
}

// เมลแจ้งเตือนรายคำขอ (ใช้เป็นสำรองเมื่อ LINE ส่งไม่ได้ หรือเมื่อเปิด "ส่งเมลทุกครั้ง")
function sendMailFor_(info, lineOk, ts, note) {
  const props = PropertiesService.getScriptProperties(), id = info.id;
  try {
    const to = props.getProperty('NOTIFY_EMAIL');
    if (!to) { props.setProperty('MAIL_LOG', ts + ' | ยังไม่ได้ตั้งอีเมลรับแจ้งเตือน'); return; }
    const subject = reqEmailSubject_(info), text = reqEmailText_(info);
    try {
      MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: reqEmailHtml_(info) });
      props.setProperty('MAIL_LOG', ts + ' | ส่งสำเร็จ ' + id + ' -> ' + to + (lineOk ? '' : ' (สำรองแทน LINE)') + (note ? ' ' + note : ''));
    } catch (e1) {
      // เมลแบบสวยส่งไม่ได้ -> ลองส่งแบบข้อความล้วนแทน
      MailApp.sendEmail({ to: to, subject: subject, body: text });
      props.setProperty('MAIL_LOG', ts + ' | ' + id + ' ส่งแบบข้อความล้วน เพราะ HTML ผิดพลาด: ' + e1);
    }
  } catch (e) {
    props.setProperty('MAIL_LOG', ts + ' | ล้มเหลว ' + id + ': ' + e);
    console.error('notifyAdmin_ mail failed: ' + e + (e && e.stack ? '\n' + e.stack : ''));
  }
}

// แจ้งแอดมินเมื่อมีคำขอใหม่ ลำดับ: บันทึกชีทแล้ว (กระดิ่งบนหน้าเว็บอ่านจากชีท) -> LINE -> เมลสำรอง
// เมลส่งเมื่อ LINE ส่งไม่สำเร็จ/ยังไม่ได้ตั้งค่า/โควตาใกล้หมด หรือเมื่อเปิด ALWAYS_EMAIL = 1
function notifyAdmin_(bookKey, id, items, person, note, txDate, ss, kind) {
  const props = PropertiesService.getScriptProperties();
  const ts = Utilities.formatDate(new Date(), TZ_, 'dd/MM/yyyy HH:mm:ss');
  let info;
  try {
    const book = allBooks_().filter(b => b.key === bookKey)[0] || getBookList_()[0] || { name: '' };
    let bals = {};
    try { bals = readBalances_(ss); } catch (e) {}
    info = {
      id: id, kind: kind || 'เบิก', person: person, book: book.name, note: note,
      txDate: fmtDT_(txDate, 'dd/MM/yyyy'), link: props.getProperty('WEB_URL') || '',
      items: items.map(function (it) {
        const b = bals[it.mat.code];
        return { code: it.mat.code, name: it.mat.name, unit: it.mat.unit, qty: it.qty, balance: b ? b.balance : null };
      })
    };
  } catch (e) {
    props.setProperty('MAIL_LOG', ts + ' | ล้มเหลว ' + id + ': ' + e);
    props.setProperty('LINE_LOG', ts + ' | ไม่ได้ส่ง ' + id + ': ' + e);
    console.error('notifyAdmin_ failed: ' + e);
    return;
  }

  const always = props.getProperty('ALWAYS_EMAIL') === '1';

  // ปิด LINE ในตั้งค่า / ยังไม่ได้ตั้งค่า -> ใช้เมลเป็นช่องทางหลัก
  if (!lineEnabled_(props) || !lineStatus_().configured) {
    props.setProperty('LINE_LOG', ts + ' | ข้าม LINE ' + id + ' (' + (lineEnabled_(props) ? 'ยังไม่ได้ตั้งค่า LINE' : 'ปิดการส่ง LINE ในตั้งค่า') + ')');
    sendMailFor_(info, false, ts);
    return;
  }

  // 1) LINE: ส่งทันที หรือเข้าคิวรวมเป็นการ์ดเดียวถ้ามีคำขออื่นเพิ่งส่งไปไม่นาน
  let mode = 'sent', r = null;
  const lock = LockService.getScriptLock();
  let locked = false;
  try { lock.waitLock(15000); locked = true; } catch (e) { /* ล็อกไม่ได้ ก็ส่งทันทีไม่ผ่านคิว */ }
  try {
    const sec = lineBatchSec_(props), now = Date.now();
    const last = Number(props.getProperty('LINE_LAST_AT') || 0), idx = qIndex_(props), since = Number(props.getProperty('NQ_AT') || now);
    if (locked && sec > 0 && (idx.length || now - last < sec * 1000)) {
      enqueueNotify_(props, info);
      mode = 'queued';
      // ตัวตั้งเวลาหาย/ค้างนานผิดปกติ -> ส่งคิวทันทีไม่ให้แจ้งเตือนตกหล่น
      const stuck = idx.length && now - since > (sec * 2 + 120) * 1000;
      if (stuck || !scheduleFlush_(last + sec * 1000 - now)) { mode = 'flushed'; r = flushQueueLocked_(); }
    } else {
      try { r = pushLine_(info); } catch (e) { r = { ok: false, reason: String(e) }; }
      props.setProperty('LINE_LAST_AT', String(Date.now()));
    }
  } finally { if (locked) lock.releaseLock(); }

  if (mode === 'queued') {
    props.setProperty('LINE_LOG', ts + ' | เข้าคิวรวมการ์ด ' + id + ' (จะส่ง LINE รวมภายใน ' + lineBatchSec_(props) + ' วินาที)');
    if (always) sendMailFor_(info, true, ts, '(รอรวมการ์ด LINE)');
    else props.setProperty('MAIL_LOG', ts + ' | รอรวมการ์ด LINE ' + id + ' (ถ้า LINE ส่งไม่สำเร็จจะส่งเมลสำรอง)');
    return;
  }
  if (mode === 'flushed') {   // ส่งคิวพร้อมคำขอนี้ไปแล้วในการ์ดรวม (เมลสำรองถูกจัดการใน flushQueueLocked_)
    if (always) sendMailFor_(info, !!(r && r.ok), ts);
    return;
  }
  const lineOk = !!(r && r.ok);
  const lineWhy = (r && r.reason) || '';
  props.setProperty('LINE_LOG', ts + ' | ' + (lineOk ? 'ส่งสำเร็จ ' + id + (lineWhy ? ' (' + (r.plain ? 'ส่งแบบข้อความล้วน) ' : '') + lineWhy : '') : 'ไม่สำเร็จ ' + id + ': ' + lineWhy));

  // 2) เมล: ส่งเมื่อ LINE ไม่สำเร็จ หรือเปิด "ส่งเมลทุกครั้ง"
  if (lineOk && !always) {
    props.setProperty('MAIL_LOG', ts + ' | ข้ามเมล ' + id + ' (ส่ง LINE สำเร็จแล้ว)');
    return;
  }
  sendMailFor_(info, lineOk, ts);
}

// อ่านแท็บคำขอ แล้วรวมแถวที่เลขที่คำขอเดียวกันเป็น 1 คำขอ (แถวเก่าที่มี 1 รายการก็ใช้ได้เหมือนเดิม)
function readRequestGroups_(ss) {
  const sh = ss.getSheetByName(REQ_SHEET_);
  const groups = [], byId = {};
  if (!sh || sh.getLastRow() < 2) return groups;
  sh.getRange(2, 1, sh.getLastRow() - 1, reqCols_(sh)).getValues().forEach(function (r, idx) {
    if (!r[0]) return;
    const id = String(r[0]);
    let g = byId[id];
    if (!g) {
      g = byId[id] = {
        id: id, reqAt: fmtDT_(r[1], 'dd/MM/yyyy HH:mm'), txDate: fmtDT_(r[2], 'yyyy-MM-dd'),
        person: String(r[7]), note: String(r[8] || ''), status: String(r[9] || '').trim(),
        decidedAt: fmtDT_(r[10], 'dd/MM/yyyy HH:mm'), reason: String(r[11] || ''), kind: String(r[12] || '').trim() === 'คืน' ? 'คืน' : 'เบิก', items: []
      };
      groups.push(g);
    }
    g.items.push({ code: String(r[3]).trim(), name: String(r[4]), unit: String(r[5]), qty: Number(r[6]) || 0 });
  });
  return groups;
}

// (แอดมิน) รายการคำขอของชีทที่เลือก + จำนวนคำขอที่รออนุมัติของทุกชีท
// เร็วขึ้นโดย: อ่านแท็บคำขอของชีทที่เลือกครั้งเดียว (เดิมอ่านซ้ำ 2 รอบ), ใช้แคชสำหรับยอดคงเหลือ/จำนวนรออนุมัติของชีทอื่น/เบิกสุทธิ,
// และคำนวณข้อมูลประกอบเฉพาะ 200 คำขอที่ส่งกลับ
function getRequestPanel(bookKey, status) {
  const cur = resolveBook_(bookKey).key;                 // ตรวจชื่อชีทเหมือนเดิม (ยังไม่เปิดไฟล์)
  const groups = reqGroupsC_(bookKey);
  const waitHere = groups.filter(g => g.status === ST_WAIT_).length;
  const list = groups.filter(g => !status || status === 'all' || g.status === status);
  list.reverse();
  if (list.length > 200) list.length = 200;

  let bal = {};
  if (list.length) { try { bal = balancesC_(bookKey); } catch (e) {} }
  let net = null;
  const netOf = function (person) {          // เบิกสุทธิของคนนี้ (เบิก - คืนที่เคยบันทึก) อ่านประวัติครั้งเดียว/แคชต่อการเปิดแผง
    if (!net) {
      const w = {};
      list.forEach(function (g) { if (g.kind === 'คืน' && g.status === ST_WAIT_) w[normTrimLower_(g.person)] = true; });
      net = netManyC_(bookKey, w);
    }
    return net[normTrimLower_(person)] || {};
  };
  list.forEach(function (g) {
    g.items.forEach(function (it) { it.balance = bal[it.code] ? bal[it.code].balance : null; });
    if (g.kind === 'คืน') {
      if (g.status === ST_WAIT_) { const nt = netOf(g.person); g.items.forEach(it => { it.withdrawn = Math.round((nt[it.code] || 0) * 1e6) / 1e6; }); }
      g.over = g.items.some(it => it.withdrawn != null && it.qty > it.withdrawn);
    } else {
      g.over = g.items.some(it => it.balance != null && it.qty > it.balance);
    }
    // ฟิลด์แบบเดิม (รายการแรก) เพื่อให้หน้าเว็บเวอร์ชันเก่ายังไม่พัง
    g.code = g.items[0].code; g.name = g.items[0].name; g.unit = g.items[0].unit; g.qty = g.items[0].qty; g.balance = g.items[0].balance;
  });
  const counts = getBookList_().map(b => {
    let n = 0;
    try { n = b.key === cur ? waitHere : pendCountC_(b.key); } catch (e) {}
    return { key: b.key, name: b.name, count: n };
  });
  return { list: list, counts: counts, line: lineStatus_(propsSnap_()) };
}

// (แอดมิน) อนุมัติ/ไม่อนุมัติทั้งคำขอ  f = { book, id, decision: 'approve'|'reject', reason, force }
function decideRequest(f) {
  const decision = f.decision;
  if (decision !== 'approve' && decision !== 'reject') throw new Error('คำสั่งไม่ถูกต้อง');
  const ss = getSS(f.book);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss.getSheetByName(REQ_SHEET_);
    if (!sh || sh.getLastRow() < 2) throw new Error('ไม่พบคำขอเลขที่ ' + f.id);
    const all = sh.getRange(1, 1, sh.getLastRow(), reqCols_(sh)).getValues();
    const rows = [];
    for (let i = 1; i < all.length; i++) { if (String(all[i][0]) === String(f.id)) rows.push({ row: i + 1, r: all[i] }); }
    if (!rows.length) throw new Error('ไม่พบคำขอเลขที่ ' + f.id);
    rows.forEach(x => { if (String(x.r[9]).trim() !== ST_WAIT_) throw new Error('คำขอนี้ถูกพิจารณาไปแล้ว (' + x.r[9] + ')'); });
    const now = new Date();
    const reason = cleanText_(f.reason, LIM_.note, 'เหตุผล');
    const mark = function (status, rsn) { rows.forEach(x => sh.getRange(x.row, 10, 1, 3).setValues([[status, now, safeCell_(rsn != null ? rsn : reason)]])); };

    if (decision === 'reject') {
      mark(ST_NO_);
      SpreadsheetApp.flush();
      return { success: true, message: 'บันทึก "ไม่อนุมัติ" เรียบร้อย (' + rows.length + ' รายการ)' };
    }

    // ===== แอดมินปรับยอด/อนุมัติบางรายการ: f.edits = [{ code, qty }]  (qty 0 = ไม่อนุมัติรายการนั้น, ปรับเพิ่มเกินที่ขอไม่ได้) =====
    const editMap = Object.create(null);
    (Array.isArray(f.edits) ? f.edits : []).forEach(function (e) { editMap[String(e && e.code).trim()] = Number(e && e.qty); });
    const orig = rows.map(x => Number(x.r[6]));
    const newQty = rows.map(function (x, k) {
      const code = String(x.r[3]).trim();
      if (!(code in editMap)) return orig[k];
      const q = editMap[code];
      if (!isFinite(q) || q < 0) throw new Error('จำนวนที่อนุมัติไม่ถูกต้อง (' + x.r[4] + ')');
      if (q > orig[k] + 1e-9) throw new Error('อนุมัติเกินจำนวนที่ขอไม่ได้ (' + x.r[4] + ' ขอ ' + orig[k] + ')');
      return Math.round(q * 1e6) / 1e6;
    });
    const act = [];
    rows.forEach(function (x, k) { if (newQty[k] > 0) act.push(k); });
    if (!act.length) throw new Error('ไม่มีรายการที่อนุมัติ ถ้าไม่ต้องการอนุมัติเลย ให้กด "ไม่อนุมัติ"');
    const changes = [];
    rows.forEach(function (x, k) {
      if (newQty[k] === orig[k]) return;
      changes.push(newQty[k] === 0 ? (x.r[4] + ' ไม่อนุมัติ (ข้อ ' + orig[k] + ')') : (x.r[4] + ' ปรับ ' + orig[k] + ' → ' + newQty[k]));
    });
    const adjNote = changes.length ? ('แอดมินปรับ: ' + changes.join('; ')).slice(0, 480) : '';
    const adjTag = k => newQty[k] !== orig[k] ? ' [ปรับจาก ' + orig[k] + ']' : '';
    const isReturn = String(rows[0].r[12] || '').trim() === 'คืน';

    // ตรวจทุกรายการที่จะอนุมัติก่อนเขียน — ถ้ามีรายการไหนมีปัญหา จะไม่เขียนอะไรเลย
    const M = loadMaterials_(ss);
    const matOf = {};
    act.forEach(function (k) {
      const code = String(rows[k].r[3]).trim();
      const mat = pickMaterial_(M, code);
      if (!mat) throw new Error('ไม่พบวัสดุรหัส ' + code + ' แล้ว');
      matOf[k] = mat;
    });
    const first = rows[act[0]].r;
    const when = first[2] instanceof Date ? first[2] : parseDateParam_(String(first[2]));
    const finish = function () {
      rows.forEach(function (x, k) { if (newQty[k] !== orig[k]) sh.getRange(x.row, 7).setValue(newQty[k]); });
      mark(ST_OK_, adjNote);
      SpreadsheetApp.flush();
    };

    // ===== คำขอคืน: อนุมัติแล้วบันทึกเป็น "รับเข้า" หมายเหตุขึ้นต้น [คืนเบิก] (เหมือนที่แอดมินบันทึกคืนเบิกเอง) =====
    if (isReturn) {
      if (!f.force) {
        const net = netByCode_(ss, String(rows[0].r[7])), overR = [];
        act.forEach(function (k) {
          const m = matOf[k], n = Math.round((net[m.code] || 0) * 1e6) / 1e6, qty = newQty[k];
          if (qty > n) overR.push({ name: m.name, unit: m.unit, qty: qty, withdrawn: n });
        });
        if (overR.length) return { success: false, needConfirm: true, kind: 'คืน', over: overR };
      }
      appendTxBatch_(ss, 'IN', act.map(function (k) {
        const x = rows[k];
        return { txDate: when, name: matOf[k].name, qty: newQty[k], person: String(x.r[7]), note: ('[คืนเบิก] [อนุมัติ ' + x.r[0] + '] ' + String(x.r[8] || '') + adjTag(k)).trim() };
      }));
      finish();
      return { success: true, message: 'อนุมัติรับคืนแล้ว ' + act.length + ' รายการ ยอดคงเหลือเพิ่มขึ้นตามจำนวนที่คืน (บันทึกในแท็บ "รับเข้า")' + (adjNote ? ' · มีการปรับยอด' : '') };
    }

    // ===== คำขอเบิก =====
    if (!f.force) {
      const bal = readBalances_(ss), over = [];
      act.forEach(function (k) {
        const cur = bal[matOf[k].code], qty = newQty[k];
        if (cur && qty > cur.balance) over.push({ name: matOf[k].name, unit: matOf[k].unit, balance: cur.balance, qty: qty });
      });
      if (over.length) return { success: false, needConfirm: true, over: over, name: over[0].name, unit: over[0].unit, balance: over[0].balance, qty: over[0].qty };
    }
    appendTxBatch_(ss, 'OUT', act.map(function (k) {
      const x = rows[k];
      return { txDate: when, name: matOf[k].name, qty: newQty[k], person: String(x.r[7]), note: ('[อนุมัติ ' + x.r[0] + '] ' + String(x.r[8] || '') + adjTag(k)).trim() };
    }));
    finish();
    return { success: true, message: 'อนุมัติและตัดสต็อกแล้ว ' + act.length + ' รายการ (บันทึกในแท็บ "เบิก")' + (adjNote ? ' · มีการปรับยอด' : '') };
  } finally {
    lock.releaseLock();
  }
}

/* =====================================================================
 * ประวัติเบิก-คืนรายบุคคล (ผู้ใช้ทั่วไปดูของตัวเองตามชื่อที่กรอก)
 * - ส่งกลับเฉพาะรายการของ "ชื่อที่ขอ" เท่านั้น (เทียบชื่อแบบไม่สนตัวพิมพ์/ช่องว่าง)
 * - รวมรายการที่ตัดสต็อกแล้ว (เบิก/คืน) + คำขอที่ยังรออนุมัติหรือไม่อนุมัติ
 * - กันค้นรัว: ทั้งระบบไม่เกิน MYH_PER_MIN_ ครั้งต่อนาที
 * ===================================================================== */
const MYH_PER_MIN_ = 60;
function myHistThrottle_() {
  const c = CacheService.getScriptCache(), k = 'MYH_' + Utilities.formatDate(new Date(), TZ_, 'yyyyMMddHHmm');
  const n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 120);
  if (n > MYH_PER_MIN_) throw new Error('มีการค้นประวัติถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
}
function getMyHistory(bookKey, name) {
  const norm = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const key = norm(name).slice(0, 60);
  if (!key) throw new Error('กรุณาระบุชื่อ');
  myHistThrottle_();
  resolveBook_(bookKey);
  const out = [], grp = {};

  // 1) รายการที่ตัดสต็อกแล้ว: เบิกจ่าย / คืนเบิก (อ่านจากแท็บ เบิก และ รับเข้า โดยตรง)
  //    ถ้าหมายเหตุมี [อนุมัติ เลขที่คำขอ] ให้รวมแถวของคำขอเดียวกันเป็นใบเดียว
  histC_(bookKey).forEach(function (h) {
    if (norm(h.person) !== key || (h.type !== 'เบิกจ่าย' && h.type !== 'คืนเบิก')) return;
    const note = String(h.note || ''), m = /\[อนุมัติ ([^\]]+)\]/.exec(note), id = m ? m[1] : '';
    const k = id ? 'id|' + id : h.date + '|' + h.type + '|' + note;
    let e = grp[k];
    if (!e) {
      e = grp[k] = {
        kind: h.type === 'คืนเบิก' ? 'คืน' : 'เบิก', status: 'เสร็จสิ้น', date: h.date, rawDate: h.rawDate || 0,
        note: note.replace(/^(\[[^\]]*\]\s*)+/, '').trim(), reason: '', id: id, items: []
      };
      out.push(e);
    }
    e.items.push({ name: h.name, unit: h.unit, qty: h.quantity });
  });

  // 2) คำขอที่ยังไม่เสร็จ: รออนุมัติ / ไม่อนุมัติ (ที่อนุมัติแล้วอยู่ในข้อ 1 อยู่แล้ว จึงไม่นับซ้ำ)
  reqGroupsC_(bookKey).forEach(function (g) {
    if (norm(g.person) !== key || g.status === ST_OK_) return;
    const p = String(g.txDate || '').split('-');
    out.push({
      kind: g.kind === 'คืน' ? 'คืน' : 'เบิก', status: g.status || ST_WAIT_, date: g.txDate,
      rawDate: p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime() : 0,
      note: g.note || '', reason: g.reason || '', id: g.id,
      items: g.items.map(function (it) { return { name: it.name, unit: it.unit, qty: it.qty }; })
    });
  });

  // รออนุมัติขึ้นก่อน แล้วเรียงใหม่ → เก่า
  out.sort(function (a, b) {
    const wa = a.status === ST_WAIT_ ? 1 : 0, wb = b.status === ST_WAIT_ ? 1 : 0;
    return (wb - wa) || ((b.rawDate || 0) - (a.rawDate || 0));
  });
  return { name: String(name).trim().slice(0, 60), list: out.slice(0, 300) };
}

// (ผู้ใช้ทั่วไป) คำขอล่าสุดของ "ชื่อนี้" (ทุกสถานะ) อ่านเฉพาะแท็บคำขอ จึงเบากว่า getMyHistory — ใช้กับกล่อง "คำขอของฉัน" หน้าแรก
// ดูได้จากทุกเครื่องที่กรอกชื่อเดียวกัน (ไม่ผูกกับเบราว์เซอร์เครื่องเดียว)
const MYR_PER_MIN_ = 120;
function getMyRequests(bookKey, name) {
  const norm = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
  const key = norm(name).slice(0, 60);
  if (!key) return [];
  const c = CacheService.getScriptCache(), k = 'MYR_' + Utilities.formatDate(new Date(), TZ_, 'yyyyMMddHHmm');
  const n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), 120);
  if (n > MYR_PER_MIN_) throw new Error('มีการเช็กสถานะถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
  return reqGroupsC_(bookKey).filter(g => norm(g.person) === key).slice(-12).reverse().map(function (g) {
    return {
      id: g.id, reqAt: g.reqAt, person: g.person, status: g.status, reason: g.reason, kind: g.kind,
      items: g.items.map(it => ({ name: it.name, unit: it.unit, qty: it.qty })),
      name: g.items[0].name, unit: g.items[0].unit, qty: g.items[0].qty
    };
  });
}

// (ผู้ใช้ทั่วไป) ดูสถานะเฉพาะคำขอของตัวเอง โดยส่งเลขที่คำขอมา ไม่เปิดเผยข้อมูลคำขออื่น
function getRequestStatuses(bookKey, ids) {
  ids = (ids || []).slice(0, 30).map(String);
  if (!ids.length) return [];
  const want = {};
  ids.forEach(i => want[i] = 1);
  return reqGroupsC_(bookKey).filter(g => want[g.id]).map(function (g) {
    return {
      id: g.id, reqAt: g.reqAt, person: g.person, status: g.status, reason: g.reason, kind: g.kind,
      items: g.items.map(it => ({ name: it.name, unit: it.unit, qty: it.qty })),
      name: g.items[0].name, unit: g.items[0].unit, qty: g.items[0].qty
    };
  }).reverse();
}

/* =====================================================================
 * API สำหรับหน้าเว็บที่โฮสต์ไว้ข้างนอก (เช่น GitHub Pages)
 * หน้าเว็บส่ง POST แบบ text/plain: {"fn":"ชื่อฟังก์ชัน","args":[...]}
 * ตอบกลับ JSON: {ok:true,result:...} หรือ {ok:false,error:"..."}
 * ต้อง Deploy เป็นเวอร์ชันใหม่หลังวางโค้ดนี้
 * ===================================================================== */
const API_FUNCS_ = {
  getBooks: getBooks, getAllData: getAllData, getAllHistory: getAllHistory,
  getDashboardData: getDashboardData, getMaterialList: getMaterialList,
  generateDateRangeReport: generateDateRangeReport,
  recordTransaction: recordTransaction, recordAdjustment: recordAdjustment, recordCount: recordCount, recordReturn: recordReturn,
  addMaterial: addMaterial, getNextCode: getNextCode,
  getBindingConfig: getBindingConfig, getBindingConfigFull: getBindingConfigFull, saveBindingConfig: saveBindingConfig,
  previewBindingJob: previewBindingJob, recordBindingJob: recordBindingJob,
  previewJob2: previewJob2, submitJobRequest: submitJobRequest, recordJob2: recordJob2,
  submitRequest: submitRequest, submitReturnRequest: submitReturnRequest, getRequestPanel: getRequestPanel, decideRequest: decideRequest, getRequestStatuses: getRequestStatuses, getMyRequests: getMyRequests, getMyHistory: getMyHistory,
  getSettings: getSettings, saveSettings: saveSettings, sendTestEmail: sendTestEmail, sendTestLine: sendTestLine, getPerf: getPerf,
  getBookAdmin: getBookAdmin, checkBook: checkBook, adminSaveBooks: adminSaveBooks, adminCreateBook: adminCreateBook, adminSetTemplate: adminSetTemplate
};

/* ---------- สิทธิ์: ผู้ใช้ทั่วไปทำได้เฉพาะดูรายการวัสดุ และส่งคำขอเบิก/คืน ----------
 * ตั้งรหัสแอดมิน: Apps Script > Project Settings > Script Properties > เพิ่ม ADMIN_PW = รหัสเดียวกับที่ใช้หน้าเว็บ */
// คำสั่งที่ไม่แก้ข้อมูลในชีท (ไม่ล้างแคช) — คำสั่งอื่นทุกตัวที่ไม่อยู่ในลิสต์นี้จะล้างแคชหลังทำงาน (ปลอดภัยไว้ก่อน)
const READ_ONLY_ = ['getBooks', 'getAllData', 'getAllHistory', 'getDashboardData', 'getMaterialList', 'generateDateRangeReport',
  'getBindingConfig', 'getBindingConfigFull', 'getNextCode', 'previewBindingJob', 'previewJob2', 'getRequestPanel', 'getRequestStatuses',
  'getMyRequests', 'getMyHistory', 'getSettings', 'getPerf', 'sendTestEmail', 'sendTestLine', 'getBookAdmin', 'checkBook'];
const PUBLIC_FUNCS_ = ['getBooks', 'getAllData', 'previewJob2', 'submitJobRequest', 'submitRequest', 'submitReturnRequest', 'getRequestStatuses', 'getMyRequests', 'getMyHistory'];
/* ---------- รหัสแอดมิน: ตั้ง/เปลี่ยนได้จากหน้าเว็บ (เมนู "ตั้งค่า") ----------
 * เก็บเป็นแฮชใน Script Properties ไม่เก็บรหัสจริง
 * รหัสเริ่มต้น (ก่อนมีการตั้งรหัสครั้งแรก) = APP_CONFIG.defaultAdminPw -> ระบบจะบังคับให้เปลี่ยนตอนล็อกอิน
 * กันเดารหัส: นับรหัสผิดแยกตาม "รหัสเครื่อง" (device ID ที่หน้าเว็บสร้างเก็บไว้ในเบราว์เซอร์)
 *   - เครื่องไหนผิดครบ ADM_MAX_DEV_ ครั้ง ล็อกเฉพาะเครื่องนั้น 10 นาที เครื่องอื่นเข้าได้ปกติ
 *   - ชั้นสำรอง: รหัสผิดรวมทุกเครื่องครบ ADM_MAX_ALL_ ครั้งใน 10 นาที จะล็อกทั้งระบบ (กันคนสุ่มรหัสเครื่องหลบ)
 *   - ถ้าถูกล็อกจนเข้าไม่ได้: เปิด Apps Script เลือกฟังก์ชัน unlockAdmin แล้วกด Run */
const DEFAULT_PW_ = APP_CONFIG.defaultAdminPw;
const ADM_MAX_DEV_ = 10, ADM_MAX_ALL_ = 60, ADM_WINDOW_SEC_ = 600;

function hashPw_(pw, salt) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8);
  return d.map(x => ((x < 0 ? x + 256 : x) + 0x100).toString(16).slice(1)).join('');
}

function cleanDev_(d) { d = String(d || ''); return /^[A-Za-z0-9_-]{8,64}$/.test(d) ? d : 'nodev'; }

function adminState_(pw, dev) {
  pw = String(pw || '');
  if (!pw) return { admin: false };
  const cache = CacheService.getScriptCache();
  const props = propsSnap_();                              // อ่านค่าทั้งหมดครั้งเดียว (เดิม 3-4 ครั้งต่อคำสั่ง)
  const ep = props.getProperty('ADM_EPOCH') || '0';           // unlockAdmin เปลี่ยนค่านี้ ตัวนับเก่าทั้งหมดจึงใช้ไม่ได้ทันที
  const kDev = 'adm_fail_' + ep + '_' + cleanDev_(dev), kAll = 'adm_fail_' + ep + '_all';
  const fc = cache.getAll([kDev, kAll]), fDev = Number(fc[kDev] || 0), fAll = Number(fc[kAll] || 0);
  if (fDev >= ADM_MAX_DEV_ || fAll >= ADM_MAX_ALL_) return { admin: false, locked: true };
  const hash = props.getProperty('ADMIN_PW_HASH');
  let ok, isDefault = false;
  if (hash) {
    ok = hashPw_(pw, props.getProperty('ADMIN_SALT') || '') === hash;
  } else {
    const plain = props.getProperty('ADMIN_PW');   // รองรับกรณีเคยตั้งไว้ใน Script Properties โดยตรง
    isDefault = !plain;
    ok = pw === (plain || DEFAULT_PW_);
  }
  if (!ok) {
    cache.put(kDev, String(fDev + 1), ADM_WINDOW_SEC_);
    cache.put(kAll, String(fAll + 1), ADM_WINDOW_SEC_);
    return { admin: false };
  }
  if (fDev > 0) cache.remove(kDev);
  return { admin: true, isDefault: isDefault };
}
function isAdmin_(pw, dev) { return adminState_(pw, dev).admin; }

// (เจ้าของ) ปลดล็อกแอดมินทุกเครื่อง: เปิดตัวแก้ไข Apps Script > เลือกฟังก์ชัน unlockAdmin > กด Run
function unlockAdmin() {
  PropertiesService.getScriptProperties().setProperty('ADM_EPOCH', String(Date.now()));
  Logger.log('ปลดล็อกการเข้าสู่ระบบแอดมินทุกเครื่องแล้ว ลองเข้าสู่ระบบใหม่ได้ทันที');
}

/* ===== ประวัติการตั้งค่าของแอดมิน: เก็บล่าสุด 30 ครั้ง (ไม่เก็บ token/รหัสผ่านจริง) ===== */
const SETTINGS_LOG_KEY_ = 'SETTINGS_LOG';
function settingsLog_(p) {
  try { const a = JSON.parse((p || PropertiesService.getScriptProperties()).getProperty(SETTINGS_LOG_KEY_) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function settingsLogAdd_(p, changes) {
  if (!changes.length) return;
  const list = settingsLog_(p);
  list.unshift({ t: Utilities.formatDate(new Date(), TZ_, 'dd/MM/yyyy HH:mm'), c: changes.map(x => String(x).slice(0, 200)).slice(0, 12) });
  let keep = list.slice(0, 30);
  // ค่า property เก็บได้ราว 9KB (ไทย 3 ไบต์/ตัว) จึงตัดรายการเก่าออกถ้าเกิน
  while (keep.length > 1 && Utilities.newBlob(JSON.stringify(keep)).getBytes().length > 8000) keep.pop();
  p.setProperty(SETTINGS_LOG_KEY_, JSON.stringify(keep));
}

// (แอดมิน) ค่าที่ตั้งจากหน้าเว็บ
function getSettings() {
  const p = propsSnap_();                                  // อ่าน Properties ครั้งเดียว (เดิมไล่อ่านทีละคีย์กว่า 15 ครั้ง)
  const ls = lineStatus_(p);
  return {
    notifyEmail: p.getProperty('NOTIFY_EMAIL') || '', webUrl: p.getProperty('WEB_URL') || '',
    lineConfigured: ls.configured, lineUserId: p.getProperty('LINE_USER_ID') || '',   // ไม่ส่ง token กลับไปหน้าเว็บ
    lineUsed: ls.used, lineLimit: ls.limit, lineStopAt: ls.stopAt, alwaysEmail: p.getProperty('ALWAYS_EMAIL') === '1',
    lineEnabled: ls.enabled, lineBatchSec: lineBatchSec_(p), lineQueued: qIndex_(p).length,
    lineLog: p.getProperty('LINE_LOG') || '',
    history: settingsLog_(p)
  };
}

// (แอดมิน) บันทึกอีเมลแจ้งเตือน / ลิงก์เว็บ / รหัสผ่านใหม่  f = { notifyEmail, webUrl, newPassword? }
function saveSettings(f) {
  const p = PropertiesService.getScriptProperties();
  const mails = String(f.notifyEmail || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  const bad = mails.filter(m => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m));
  if (bad.length) throw new Error('อีเมลไม่ถูกต้อง: ' + bad.join(', '));
  const url = String(f.webUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error('ลิงก์หน้าเว็บต้องขึ้นต้นด้วย https://');
  // LINE: token เว้นว่าง = ไม่เปลี่ยน, clearLine = ลบทั้งคู่
  const lineUid = String(f.lineUserId || '').trim();
 if (lineUid && !/^[UC][0-9a-f]{32}$/i.test(lineUid)) throw new Error('LINE ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U สำหรับบุคคล หรือ C สำหรับกลุ่ม ตามด้วยตัวอักษร/ตัวเลข 32 ตัว)');
  const lineTok = String(f.lineToken || '').trim();
  if (lineTok && !/^[\x21-\x7e]{40,300}$/.test(lineTok)) throw new Error('LINE Channel access token ไม่ถูกต้อง (ต้องคัดลอกมาทั้งชุดโดยไม่มีช่องว่าง)');
  const before = { mail: p.getProperty('NOTIFY_EMAIL') || '', url: p.getProperty('WEB_URL') || '', uid: p.getProperty('LINE_USER_ID') || '',
    always: p.getProperty('ALWAYS_EMAIL') === '1', lineOn: lineEnabled_(p), batch: lineBatchSec_(p), hadLine: !!p.getProperty('LINE_TOKEN') };
  let changed = false;
  if (f.newPassword) {
    const pw = String(f.newPassword);
    if (pw.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    const salt = Utilities.getUuid();
    p.setProperty('ADMIN_SALT', salt);
    p.setProperty('ADMIN_PW_HASH', hashPw_(pw, salt));
    p.deleteProperty('ADMIN_PW');
    changed = true;
  }
  if (f.clearLine) { p.deleteProperty('LINE_TOKEN'); p.deleteProperty('LINE_USER_ID'); }
  else { if (lineTok) p.setProperty('LINE_TOKEN', lineTok); if (lineUid) p.setProperty('LINE_USER_ID', lineUid); }
  f.alwaysEmail ? p.setProperty('ALWAYS_EMAIL', '1') : p.deleteProperty('ALWAYS_EMAIL');
  if (f.lineEnabled !== undefined) f.lineEnabled === false ? p.setProperty('LINE_OFF', '1') : p.deleteProperty('LINE_OFF');
  if (f.lineBatchSec !== undefined && f.lineBatchSec !== '') {
    const bs = Number(f.lineBatchSec);
    if (!isFinite(bs) || bs < 0 || bs > 600) throw new Error('ช่วงเวลารวมการ์ด LINE ต้องอยู่ระหว่าง 0 ถึง 600 วินาที');
    p.setProperty('LINE_BATCH_SEC', String(Math.floor(bs)));
  }
  mails.length ? p.setProperty('NOTIFY_EMAIL', mails.join(',')) : p.deleteProperty('NOTIFY_EMAIL');
  url ? p.setProperty('WEB_URL', url) : p.deleteProperty('WEB_URL');
  // บันทึกประวัติ: เฉพาะสิ่งที่เปลี่ยนจริง (ล้มเหลวกลางทางจะไม่ถึงตรงนี้ จึงไม่ถูกบันทึก)
  try {
    const sh = v => (v === '' || v == null) ? '(ว่าง)' : String(v), maskId = v => v && v.length > 10 ? v.slice(0, 4) + '…' + v.slice(-4) : v;
    const after = { mail: p.getProperty('NOTIFY_EMAIL') || '', url: p.getProperty('WEB_URL') || '', uid: p.getProperty('LINE_USER_ID') || '',
      always: p.getProperty('ALWAYS_EMAIL') === '1', lineOn: lineEnabled_(p), batch: lineBatchSec_(p) };
    const ch = [];
    if (before.mail !== after.mail) ch.push('อีเมลรับแจ้ง: ' + sh(before.mail) + ' → ' + sh(after.mail));
    if (before.url !== after.url) ch.push('ลิงก์หน้าเว็บ: ' + sh(before.url) + ' → ' + sh(after.url));
    if (f.clearLine) { if (before.hadLine || before.uid) ch.push('ลบการตั้งค่า LINE'); }
    else {
      if (before.uid !== after.uid) ch.push('LINE User ID: ' + sh(maskId(before.uid)) + ' → ' + sh(maskId(after.uid)));
      if (lineTok) ch.push('เปลี่ยน LINE Channel access token (ไม่บันทึกค่า)');
    }
    if (before.lineOn !== after.lineOn) ch.push('ส่งแจ้งเตือนทาง LINE: ' + (before.lineOn ? 'เปิด' : 'ปิด') + ' → ' + (after.lineOn ? 'เปิด' : 'ปิด'));
    if (before.batch !== after.batch) ch.push('รวมการ์ด LINE: ' + before.batch + ' → ' + after.batch + ' วินาที');
    if (before.always !== after.always) ch.push('ส่งอีเมลทุกครั้งด้วย: ' + (before.always ? 'เปิด' : 'ปิด') + ' → ' + (after.always ? 'เปิด' : 'ปิด'));
    if (changed) ch.push('เปลี่ยนรหัสผ่านแอดมิน');
    settingsLogAdd_(p, ch);
  } catch (e) { console.error('settings log failed: ' + e); }
  return { success: true, passwordChanged: changed, message: 'บันทึกการตั้งค่าเรียบร้อย' + (changed ? ' (เปลี่ยนรหัสผ่านแล้ว)' : '') };
}

// (แอดมิน) ส่งข้อความทดสอบ LINE (นับเป็น 1 ข้อความในโควตา)
function sendTestLine() {
  const r = pushLine_('✅ ทดสอบแจ้งเตือน LINE จาก' + APP_CONFIG.appName + '\nถ้าเห็นข้อความนี้ แปลว่าตั้งค่าเรียบร้อยแล้ว');
  if (!r.ok) throw new Error(r.reason);
  const st = lineStatus_();
  return 'ส่ง LINE ทดสอบแล้ว (ใช้โควตาเดือนนี้ ' + st.used + '/' + st.limit + ')';
}

// (แอดมิน) ส่งอีเมลทดสอบไปยังอีเมลที่ตั้งไว้
function sendTestEmail() {
  const p = PropertiesService.getScriptProperties();
  const to = p.getProperty('NOTIFY_EMAIL');
  if (!to) throw new Error('ยังไม่ได้ตั้งอีเมลรับแจ้งเตือน');
  MailApp.sendEmail({ to: to, subject: '[ทดสอบ] ' + APP_CONFIG.appName, body: 'นี่คือเมลทดสอบ ถ้าได้รับเมลนี้แปลว่าตั้งค่าแจ้งเตือนคำขอเบิกเรียบร้อยแล้ว' });
  return 'ส่งอีเมลทดสอบไปที่ ' + to + ' แล้ว (ถ้าไม่เจอ ลองดูในสแปม)\nผลส่งจริงครั้งล่าสุด: ' + (p.getProperty('MAIL_LOG') || 'ยังไม่เคยมีคำขอเบิกหลังอัปเดต');
}

/* ===== สถิติความเร็วของแต่ละคำสั่ง (เก็บในแคช ดูได้จากเมนู "ตั้งค่า" > ดูความเร็วระบบ) ===== */
function perfRecord_(fn, ms) {
  try {
    const c = CacheService.getScriptCache();
    let o = {}; try { o = JSON.parse(c.get('PERF') || '{}'); } catch (e) {}
    if (!o.since || Date.now() - o.since > 86400000) o = { since: Date.now(), fn: {} };   // เริ่มนับใหม่ทุก 24 ชั่วโมง
    const x = o.fn[fn] || (o.fn[fn] = { n: 0, t: 0, max: 0, last: 0 });
    x.n++; x.t += ms; x.last = ms; if (ms > x.max) x.max = ms;
    c.put('PERF', JSON.stringify(o), 21600);
  } catch (e) {}
}
// (แอดมิน) สถิติ: จำนวนครั้ง เวลาเฉลี่ย/สูงสุดฝั่งเซิร์ฟเวอร์ (มิลลิวินาที) ไม่รวมเวลาเครือข่าย
function getPerf(reset) {
  const c = CacheService.getScriptCache();
  if (reset) { c.remove('PERF'); return { since: Date.now(), rows: [] }; }
  let o = {}; try { o = JSON.parse(c.get('PERF') || '{}'); } catch (e) {}
  const rows = Object.keys(o.fn || {}).map(function (k) { const x = o.fn[k]; return { fn: k, n: x.n, avg: Math.round(x.t / x.n), max: x.max, last: x.last }; })
    .sort(function (a, b) { return b.avg * b.n - a.avg * a.n; });
  return { since: o.since || 0, rows: rows };
}

/* =====================================================================
 * จัดการคลัง (แอดมิน): เชื่อมชีทที่มีอยู่ / สร้างจากต้นแบบ / ซ่อน / เลือกคลังใบงาน
 * ทุกฟังก์ชันรับ f = { pw, dev, ... } และตรวจแอดมินเองอีกชั้น (ใช้ได้ทั้งแบบเรียกผ่าน API และเปิดใน Apps Script)
 * ===================================================================== */
let CALLER_ADMIN_ = false;     // doPost ตั้งเป็น true เมื่อรหัสผ่านที่ส่งมาถูกต้อง
function requireAdmin_(f) {
  if (CALLER_ADMIN_) return;
  if (!adminState_(f && f.pw, f && f.dev).admin) throw new Error('ต้องเข้าสู่ระบบแอดมินก่อน');
}
function ownerEmail_() { try { return Session.getEffectiveUser().getEmail() || ''; } catch (e) { return ''; } }

// ชีทที่ระบบอ่าน/เขียน: แท็บและหัวตารางต้องตรงกับต้นแบบ (ตำแหน่งคอลัมน์ฝังอยู่ในโค้ด)
const BOOK_SPEC_ = [
  { tab: 'สรุปรายงาน', row: 4, heads: ['รหัสวัสดุ', 'ชื่อวัสดุ', 'หน่วย', 'จำนวนในคลัง', 'หน้าร้าน', 'รับเข้า', 'เบิก', 'คงเหลือ', 'Stock ขั้นต่ำ', 'สถานะ'] },
  { tab: 'รายการวัสดุ', row: 1, heads: ['รหัสวัสดุ', 'ชื่อวัสดุ', 'หน่วย', 'Stock ขั้นต่ำ'] },
  { tab: 'รับเข้า', row: 1, heads: ['วันที่', 'รหัสวัสดุ', 'ชื่อวัสดุ', 'หน่วย', 'จำนวน', 'ผู้รับ', 'หมายเหตุ'] },
  { tab: 'เบิก', row: 1, heads: ['วันที่', 'รหัสวัสดุ', 'ชื่อวัสดุ', 'หน่วย', 'จำนวน', 'ผู้เบิก', 'หมายเหตุ'] }
];
function parseSheetId_(v) {
  v = String(v || '').trim();
  const m = v.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(v) ? v : '';
}
function countFilled_(sh, col) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  return sh.getRange(2, col, n, 1).getValues().filter(r => String(r[0]).trim() !== '').length;
}
// เปิดชีทแล้วตรวจแท็บ/หัวตาราง: errors = ใช้ไม่ได้, warnings = เปิดได้แต่ควรตรวจ
function inspectBook_(id) {
  const out = { id: id, title: '', errors: [], warnings: [], materials: 0, rows: 0 };
  let ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { out.errors.push('เปิดชีทไม่ได้ ตรวจลิงก์/ID และแชร์ชีทให้บัญชี ' + (ownerEmail_() || 'เจ้าของระบบนี้ (บัญชีที่ Deploy)') + ' เป็น "ผู้แก้ไข"'); return out; }
  out.title = ss.getName();
  BOOK_SPEC_.forEach(sp => {
    const sh = ss.getSheetByName(sp.tab);
    if (!sh) { out.errors.push('ไม่พบแท็บ "' + sp.tab + '"'); return; }
    try {
      const got = sh.getRange(sp.row, 1, 1, sp.heads.length).getValues()[0].map(x => String(x).trim());
      const bad = sp.heads.filter((h, i) => got[i] !== h);
      if (bad.length) out.warnings.push('แท็บ "' + sp.tab + '" หัวคอลัมน์ไม่ตรงต้นแบบ (' + bad.join(', ') + ') ตรวจว่าเรียงคอลัมน์เหมือนต้นแบบ');
    } catch (e) { out.warnings.push('อ่านหัวตารางแท็บ "' + sp.tab + '" ไม่ได้ (คอลัมน์น้อยกว่าต้นแบบ)'); }
  });
  if (!out.errors.length) {
    try {
      out.materials = countFilled_(ss.getSheetByName('รายการวัสดุ'), 1);
      out.rows = countFilled_(ss.getSheetByName('รับเข้า'), 3) + countFilled_(ss.getSheetByName('เบิก'), 3);
    } catch (e) {}
  }
  return out;
}
function newBookKey_(used) {
  for (let i = 0; i < 20; i++) {
    const k = 'b' + Utilities.getUuid().replace(/-/g, '').slice(0, 7);
    if (!used[k]) return k;
  }
  throw new Error('สร้างรหัสคลังไม่สำเร็จ ลองใหม่อีกครั้ง');
}
function cleanBookName_(v, label) {
  const name = String(v || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error((label || 'คลัง') + ' ยังไม่ได้ตั้งชื่อ');
  if (name.length > 40) throw new Error('ชื่อคลังยาวเกิน 40 ตัวอักษร: ' + name.slice(0, 20) + '…');
  return name;
}
function maskId_(id) { return id && id.length > 10 ? id.slice(0, 4) + '…' + id.slice(-4) : (id || '(ชีทที่ผูกกับสคริปต์)'); }
function persistBooks_(p, list, jobKey) {
  const raw = JSON.stringify(list.map(b => { const o = { key: b.key, name: b.name, id: b.id || '' }; if (b.hidden) o.hidden = true; return o; }));
  if (Utilities.newBlob(raw).getBytes().length > 8000) throw new Error('รายการคลังยาวเกินที่ระบบเก็บได้ ลองลดจำนวนคลังหรือย่อชื่อ');
  p.setProperty(BOOKS_PROP_, raw);
  p.setProperty(JOBKEY_PROP_, jobKey || '-');
  BOOKS_MEMO_ = null;
  Object.keys(SS_MEMO_).forEach(k => delete SS_MEMO_[k]);
}
function bookView_() {
  return { books: allBooks_().map(b => ({ key: b.key, name: b.name, id: b.id || '', hidden: !!b.hidden })), jobBookKey: jobBookKey_() };
}

// (แอดมิน) รายการคลังทั้งหมด + ชีทต้นแบบ + อีเมลที่ต้องแชร์ชีทให้
function getBookAdmin(f) {
  requireAdmin_(f);
  const v = bookView_();
  v.templateId = templateId_();
  v.owner = ownerEmail_();
  v.saved = propsSnap_().getProperty(BOOKS_PROP_) !== null;
  return v;
}
// (แอดมิน) ตรวจชีทหนึ่งไฟล์: f = { id } (วางลิงก์หรือ ID ก็ได้)
function checkBook(f) {
  requireAdmin_(f);
  const id = parseSheetId_(f.id);
  if (!id) return { errors: ['ลิงก์/Spreadsheet ID ไม่ถูกต้อง'], warnings: [], title: '' };
  return inspectBook_(id);
}
// (แอดมิน) บันทึกรายการคลังทั้งชุด  f = { books:[{key?,name,id,hidden}], jobIndex }  (ห้ามลบคลังที่เคยมี ให้ซ่อนแทน)
function adminSaveBooks(f) {
  requireAdmin_(f);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return saveBooks_(f); } finally { lock.releaseLock(); }
}
function saveBooks_(f) {
  const incoming = Array.isArray(f.books) ? f.books : [];
  if (incoming.length > MAX_BOOKS_) throw new Error('เชื่อมคลังได้ไม่เกิน ' + MAX_BOOKS_ + ' รายการ');
  const prev = allBooks_(), prevByKey = {};
  prev.forEach(b => { prevByKey[b.key] = b; });
  const usedKeys = {}, usedIds = {}, usedNames = {}, out = [], warnings = [], changes = [];
  incoming.forEach((b, i) => {
    const name = cleanBookName_(b.name, 'คลังที่ ' + (i + 1));
    let key = String(b.key || '');
    const old = key ? prevByKey[key] : null;
    if (!old) key = newBookKey_(Object.assign({}, usedKeys, prevByKey));   // key ที่ไม่รู้จัก = คลังใหม่ (ไม่เชื่อ key จากหน้าเว็บ)
    if (usedKeys[key]) throw new Error('รหัสคลังซ้ำกัน');
    usedKeys[key] = true;
    const nk = name.toLowerCase();
    if (usedNames[nk]) throw new Error('มีคลังชื่อ "' + name + '" ซ้ำกัน กรุณาตั้งชื่อให้ต่างกัน');
    usedNames[nk] = true;
    let id = parseSheetId_(b.id);
    if (!id) {
      if (old && !old.id && !String(b.id || '').trim()) id = '';          // คลังเดิมที่ใช้ชีทที่ผูกกับสคริปต์
      else throw new Error('คลัง "' + name + '": ลิงก์/Spreadsheet ID ไม่ถูกต้อง');
    }
    if (id) {
      if (usedIds[id]) throw new Error('คลัง "' + name + '" ใช้ชีทไฟล์เดียวกับอีกคลัง (ซ้ำกัน)');
      usedIds[id] = true;
    }
    const hidden = !!b.hidden;
    if (id && !hidden && (!old || old.id !== id)) {                      // ตรวจเฉพาะชีทที่เพิ่ม/เปลี่ยนไฟล์
      const r = inspectBook_(id);
      if (r.errors.length) throw new Error('คลัง "' + name + '": ' + r.errors.join(' / '));
      r.warnings.forEach(w => warnings.push('"' + name + '": ' + w));
    }
    if (!old) changes.push('เพิ่มคลัง: ' + name + ' (' + maskId_(id) + ')');
    else {
      if (old.name !== name) changes.push('เปลี่ยนชื่อคลัง: ' + old.name + ' → ' + name);
      if ((old.id || '') !== id) changes.push('เปลี่ยนชีทของคลัง "' + name + '": ' + maskId_(old.id) + ' → ' + maskId_(id));
      if (!!old.hidden !== hidden) changes.push((hidden ? 'ซ่อน' : 'แสดง') + 'คลัง: ' + name);
    }
    out.push({ key: key, name: name, id: id, hidden: hidden });
  });
  prev.forEach(b => { if (!usedKeys[b.key]) throw new Error('ลบคลังไม่ได้ (ข้อมูลในชีทจะไม่มีทางเข้าถึง) ให้ใช้ปุ่ม "ซ่อน" แทน: ' + b.name); });
  const ji = Number(f.jobIndex), jb = (ji >= 0 && out[ji]) ? out[ji] : null;
  if (jb && jb.hidden) throw new Error('คลังที่ใช้ใบงานเข้าเล่มต้องไม่ถูกซ่อน');
  const prevJob = jobBookKey_();
  if ((jb ? jb.key : '') !== prevJob) changes.push('คลังที่ใช้ใบงานเข้าเล่ม: ' + (jb ? jb.name : 'ไม่ใช้'));
  const p = PropertiesService.getScriptProperties();
  persistBooks_(p, out, jb ? jb.key : '');
  try { settingsLogAdd_(p, changes); } catch (e) {}
  const v = bookView_();
  v.warnings = warnings;
  v.message = changes.length ? 'บันทึกรายการคลังแล้ว' : 'ไม่มีการเปลี่ยนแปลง';
  return v;
}
// (แอดมิน) ตั้ง/ล้างชีทต้นแบบ  f = { id }  (เว้นว่าง = ล้าง)
function adminSetTemplate(f) {
  requireAdmin_(f);
  const p = PropertiesService.getScriptProperties();
  const raw = String(f.id || '').trim();
  if (!raw) { p.deleteProperty(TEMPLATE_PROP_); settingsLogAdd_(p, ['ล้างชีทต้นแบบ']); return { templateId: APP_CONFIG.templateId || '', title: '', warnings: [], message: 'ล้างชีทต้นแบบแล้ว' }; }
  const id = parseSheetId_(raw);
  if (!id) throw new Error('ลิงก์/Spreadsheet ID ไม่ถูกต้อง');
  const r = inspectBook_(id);
  if (r.errors.length) throw new Error(r.errors.join(' / '));
  const warnings = r.warnings.slice();
  if (r.materials || r.rows) warnings.push('ต้นแบบยังมีข้อมูลอยู่ (วัสดุ ' + r.materials + ' รายการ, ประวัติรับ/เบิก ' + r.rows + ' แถว) คลังที่สร้างใหม่จะมีข้อมูลนี้ติดไปด้วย ควรล้างให้เหลือเฉพาะหัวตารางและสูตรก่อน');
  p.setProperty(TEMPLATE_PROP_, id);
  settingsLogAdd_(p, ['ตั้งชีทต้นแบบ: ' + r.title + ' (' + maskId_(id) + ')']);
  return { templateId: id, title: r.title, warnings: warnings, message: 'บันทึกชีทต้นแบบแล้ว' };
}
// (แอดมิน) สร้างคลังใหม่โดยคัดลอกชีทต้นแบบ แล้วเพิ่มเข้ารายการให้เลย  f = { name }
function adminCreateBook(f) {
  requireAdmin_(f);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const name = cleanBookName_(f.name, 'คลังใหม่');
    const cur = allBooks_();
    if (cur.length >= MAX_BOOKS_) throw new Error('เชื่อมคลังได้ไม่เกิน ' + MAX_BOOKS_ + ' รายการ');
    if (cur.some(b => String(b.name).toLowerCase() === name.toLowerCase())) throw new Error('มีคลังชื่อ "' + name + '" อยู่แล้ว');
    const tid = templateId_();
    if (!tid) throw new Error('ยังไม่ได้ตั้งชีทต้นแบบ กรอกลิงก์ต้นแบบในช่อง "ชีทต้นแบบ" แล้วกดบันทึกก่อน');
    const t = inspectBook_(tid);
    if (t.errors.length) throw new Error('ชีทต้นแบบใช้ไม่ได้: ' + t.errors.join(' / '));
    let copy;
    try { copy = SpreadsheetApp.openById(tid).copy(name); }
    catch (e) { throw new Error('คัดลอกชีทต้นแบบไม่สำเร็จ: ' + ((e && e.message) || e)); }
    const used = {}; cur.forEach(b => { used[b.key] = true; });
    const key = newBookKey_(used);
    const list = cur.map(b => ({ key: b.key, name: b.name, id: b.id || '', hidden: !!b.hidden }));
    list.push({ key: key, name: name, id: copy.getId(), hidden: false });
    const p = PropertiesService.getScriptProperties();
    persistBooks_(p, list, jobBookKey_());
    try { settingsLogAdd_(p, ['สร้างคลังใหม่จากต้นแบบ: ' + name + ' (' + maskId_(copy.getId()) + ')']); } catch (e) {}
    const v = bookView_();
    v.created = { key: key, name: name, id: copy.getId(), url: copy.getUrl() };
    v.message = 'สร้างคลัง "' + name + '" แล้ว (ไฟล์อยู่ใน Google Drive ของบัญชีเจ้าของระบบ)';
    return v;
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  let out;
  const t0 = Date.now();
  let fnName = '';
  VIA_API_ = true;
  try {
    const req = JSON.parse(e.postData.contents);
    const jsonOut = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
    if (req.fn === 'checkAdmin') {
      return jsonOut({ ok: true, result: adminState_(req.pw, req.dev) });
    }
    const fn = API_FUNCS_[req.fn];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + req.fn);
    fnName = req.fn;
    const st = adminState_(req.pw, req.dev), admin = st.admin;
    CALLER_ADMIN_ = admin;
    // รหัสที่หน้าเว็บส่งมาใช้ไม่ได้แล้ว (เช่น ถูกเปลี่ยนจากเครื่องอื่น) -> บอกหน้าเว็บให้ออกจากโหมดแอดมินเอง จะได้ไม่ส่งรหัสเก่าซ้ำจนถูกล็อก
    const authLost = !!(req.pw && !admin && !st.locked);
    if (!admin && PUBLIC_FUNCS_.indexOf(req.fn) < 0) {
      return jsonOut({ ok: false, authLost: authLost, locked: !!st.locked,
        error: st.locked ? 'ล็อกการเข้าสู่ระบบชั่วคราว กรุณารอ 10 นาทีแล้วลองใหม่ หรือให้เจ้าของระบบกดปลดล็อก' : (authLost ? 'รหัสผ่านแอดมินไม่ถูกต้องหรือถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่' : 'คำสั่งนี้สำหรับแอดมินเท่านั้น') });
    }
    let args = req.args || [];
    // ผู้ใช้ทั่วไปไม่เห็นประวัติอยู่แล้ว จึงข้ามการประกอบประวัติเพื่อให้โหลดหน้าเว็บเร็วขึ้น
    if (!admin && req.fn === 'getAllData') args = [args[0], true];
    let result = fn.apply(null, args);
    // ผู้ใช้ทั่วไปไม่ต้องเห็นประวัติว่าใครเบิก/รับอะไร
    if (!admin && req.fn === 'getAllData' && result) result.history = [];
    out = { ok: true, result: result };
    if (authLost) out.authLost = true;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  if (fnName && READ_ONLY_.indexOf(fnName) < 0) bumpCacheVer_();   // มีการเขียน/แก้ข้อมูล (สำเร็จหรือล้มเหลวกลางทาง) -> ล้างแคชอ่าน
  out.ms = Date.now() - t0;                       // เวลาที่เซิร์ฟเวอร์ใช้ประมวลผล (หน้าเว็บเอาไปเทียบกับเวลาทั้งหมดได้)
  if (fnName && fnName !== 'getPerf') perfRecord_(fnName, out.ms);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ทดสอบเมลสวยโดยตรง: เลือกฟังก์ชันนี้ที่แถบด้านบน แล้วกด Run
function testHtmlMail() {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  const info = {
    id: 'TEST-001', person: 'ทดสอบ', book: 'วัสดุสิ้นเปลือง', note: 'เมลทดสอบ', txDate: '22/10/2026', link: '',
    items: [{ code: 'A1', name: 'คลิปดำ (เล็ก)', unit: 'กล่อง', qty: 10, balance: 5 }]
  };
  Logger.log('ส่งไปที่: ' + to);
  MailApp.sendEmail({ to: to, subject: reqEmailSubject_(info), body: reqEmailText_(info), htmlBody: reqEmailHtml_(info) });
  Logger.log('ส่งเมลสวยสำเร็จ (ไม่มี error) ลองดูในกล่องจดหมาย/สแปม');
}

/* =====================================================================
 * ใบงานเข้าเล่มแบบใหม่ (เพิ่มเป็นไฟล์ใหม่ใน Apps Script ชื่อ Binding.gs)
 * - ไม่ต้องตั้งสูตรในแท็บ "สูตรเข้าเล่ม" อีกต่อไป: ผู้ใช้เลือกวัสดุเองในแต่ละใบงาน
 * - แปลงหน่วยกระดาษได้ เช่น เบิกเป็น "รีม" และ 1 รีม = 500 แผ่น
 * - เผื่อเสียใช้กับกระดาษเนื้อในและกระดาษปก
 * - พนักงานส่งเป็น "คำขอเบิก" (submitJobRequest) -> แอดมินอนุมัติในหน้าคำขอเดิม -> ตัดสต็อก
 * ต้องแก้ Code.gs 3 จุดตามคำอธิบายท้ายไฟล์นี้
 * ===================================================================== */

// f = { book, copies, pages, duplex, waste,
//       paper:{code,per}, cover:{code,per,sheets}, spine:{code,perBook}, extras:[{code,perBook}] }
// per = กี่แผ่นต่อ 1 หน่วยที่เบิก (หน่วยเป็นแผ่น = 1, หน่วยเป็นรีม = 500)
// ใบงานเข้าเล่มเบิกได้เฉพาะคลังที่ตั้งไว้ (jobBookKey_()) สต็อกแยกจากคลังอื่น
function calcJob2_(ss, f) {
  const jk_ = jobBookKey_();
  if (!jk_) throw new Error('ยังไม่ได้ตั้งคลังสำหรับใบงานเข้าเล่ม (แอดมินตั้งได้ที่เมนู "จัดการคลัง")');
  if (String(f.book || '') !== jk_) throw new Error('ใบงานเข้าเล่มเบิกได้เฉพาะคลัง "' + ((allBooks_().filter(b => b.key === jk_)[0] || {}).name || jk_) + '" เท่านั้น กรุณาเลือกคลังให้ถูกต้อง');
  const copies = Math.floor(Number(f.copies)), pages = Math.floor(Number(f.pages));
  if (!(copies > 0) || copies > 100000) throw new Error('จำนวนเล่มต้องอยู่ระหว่าง 1 ถึง 100,000');
  if (!(pages > 0) || pages > 100000) throw new Error('จำนวนหน้าต่อเล่มต้องอยู่ระหว่าง 1 ถึง 100,000');
  const blank = v => v === '' || v === null || v === undefined;
  const waste = blank(f.waste) ? 0 : Number(f.waste);
  if (!isFinite(waste) || waste < 0 || waste > 100) throw new Error('% เผื่อเสียต้องอยู่ระหว่าง 0 ถึง 100');
  const bal = readBalances_(ss), need = {}, order = [];
  const perOf = x => { const n = Number(x && x.per); return isFinite(n) && n > 0 ? n : 1; };
  const add = (role, code, per) => {
    code = String(code || '').trim();
    if (!code) return null;
    if (!bal[code]) throw new Error('ไม่พบวัสดุรหัส ' + code + ' ในแท็บ "สรุปรายงาน"');
    if (!need[code]) { need[code] = { role: role, code: code, sheets: 0, units: 0, per: per }; order.push(code); }
    else need[code].role += ' + ' + role;
    return need[code];
  };
  const sheetsPerBook = Math.ceil(pages / (f.duplex ? 2 : 1));
  const p = f.paper || {};
  const ePaper = add('กระดาษเนื้อใน', p.code, perOf(p));
  if (!ePaper) throw new Error('กรุณาเลือกกระดาษเนื้อใน');
  ePaper.sheets += Math.ceil(sheetsPerBook * copies * (1 + waste / 100));

  const c = f.cover || {};
  if (c.code) {
    const cs = Number(c.sheets);
    if (!(cs > 0)) throw new Error('จำนวนแผ่นปกต่อเล่มต้องมากกว่า 0');
    add('กระดาษปก', c.code, perOf(c)).sheets += Math.ceil(cs * copies * (1 + waste / 100));
  }
  const sp = f.spine || {};
  if (sp.code) {
    const n = Number(sp.perBook);
    if (!(n > 0)) throw new Error('จำนวนสันต่อเล่มต้องมากกว่า 0');
    add('สัน', sp.code, 1).units += Math.ceil(n * copies);
  }
  (Array.isArray(f.extras) ? f.extras : []).slice(0, 10).forEach(x => {
    if (!x || !x.code) return;
    const n = Number(x.perBook);
    if (!(n > 0)) throw new Error('จำนวนต่อเล่มของวัสดุเพิ่มเติมต้องมากกว่า 0');
    add('วัสดุเพิ่มเติม', x.code, 1).units += Math.ceil(n * copies);
  });

  const r2 = v => Math.round(v * 100) / 100;
  const lines = order.map(code => {
    const e = need[code], b = bal[code];
    const paperUnits = e.sheets ? Math.ceil(e.sheets / e.per) : 0, qty = e.units + paperUnits;
    let detail = qty + ' ' + b.unit;
    if (e.sheets) detail = e.sheets + ' แผ่น' + (e.per > 1 ? ' ÷ ' + e.per + ' = ' + r2(e.sheets / e.per) + ' ' + b.unit + ' → ปัดขึ้นเป็น ' + qty + ' ' + b.unit : '');
    return { role: e.role, code: code, name: b.name, unit: b.unit, qty: qty, sheets: e.sheets, detail: detail, balance: b.balance, after: b.balance - qty, short: qty > b.balance };
  });
  return { sheetsPerBook: sheetsPerBook, waste: waste, lines: lines };
}

// พรีวิว (ทุกคนเรียกได้ อ่านอย่างเดียว)
function previewJob2(f) { return calcJob2_(getSS(f.book), f); }

// พนักงานส่งคำขอเบิกใบงาน: คำนวณซ้ำฝั่งเซิร์ฟเวอร์แล้วส่งต่อเป็นคำขอเบิกปกติ (ได้เพดานคำขอ/แจ้งเตือน LINE/อีเมลเหมือนเดิม)
function submitJobRequest(f) {
  const ss = getSS(f.book);
  const project = cleanText_(f.project, LIM_.project, 'ชื่อโครงการ');
  if (!project) throw new Error('กรุณาระบุชื่อโครงการ / หน่วยงาน');
  const job = calcJob2_(ss, f);
  const note = ('[ใบงาน] ' + project + ' · ' + Math.floor(Number(f.copies)) + ' เล่ม × ' + Math.floor(Number(f.pages)) + ' หน้า').slice(0, LIM_.note);
  return submitReqCore_({ book: f.book, txDate: f.date, personName: f.person, note: note, items: job.lines.map(l => ({ code: l.code, qty: l.qty })) }, 'เบิก');
}

// แอดมินบันทึกใบงานตัดสต็อกทันที (ไม่ผ่านการอนุมัติ)
function recordJob2(f) {
  const ss = getSS(f.book);
  const project = cleanText_(f.project, LIM_.project, 'ชื่อโครงการ');
  const person = cleanText_(f.person, LIM_.person, 'ชื่อผู้เบิก');
  if (!project) throw new Error('กรุณาระบุชื่อโครงการ / หน่วยงาน');
  if (!person) throw new Error('กรุณาระบุชื่อผู้เบิก');
  const txDate = parseDateParam_(f.date);
  if (isNaN(txDate.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const job = calcJob2_(ss, f);
    const short = job.lines.filter(l => l.short);
    if (short.length && !f.force) return { success: false, needConfirm: true, short: short };
    const M = loadMaterials_(ss);
    const mats = job.lines.map(l => {
      const m = pickMaterial_(M, l.code);
      if (!m) throw new Error('ไม่พบวัสดุรหัส ' + l.code + ' ในแท็บ "รายการวัสดุ"');
      return m;
    });
    const note = '[ใบงาน] ' + project;
    appendTxBatch_(ss, 'OUT', job.lines.map((l, i) => ({ txDate: txDate, name: mats[i].name, qty: l.qty, person: person, note: note })));
    SpreadsheetApp.flush();
    return { success: true, count: job.lines.length, message: 'บันทึกใบงาน "' + project + '" เบิก ' + job.lines.length + ' รายการเรียบร้อย' };
  } finally {
    lock.releaseLock();
  }
}
