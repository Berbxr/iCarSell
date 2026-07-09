const fmtMoneda = (n) => '$ ' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 });
const fmtFecha = (d) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function vinCeldas(vin) {
  const chars = String(vin || '').toUpperCase().padEnd(17, ' ').slice(0, 17).split('');
  return chars.map((c) => `<span class="vin-celda">${esc(c.trim())}</span>`).join('');
}

function construirHtmlContrato(v) {
  const s = v.sucursal || {};
  const ve = v.vehiculo || {};
  const c = v.cliente || {};
  // Nombre que aparece en el contrato: comercial si está definido, si no el de la sucursal.
  const nombreContrato = s.nombreComercial || s.nombre;
  const logo = s.logo ? `<img class="logo" src="${s.logo}" />` : '';
  const marcaAgua = s.logo ? `<div class="marca-agua"><img src="${s.logo}" /></div>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #16387a; }
    body { margin: 0; padding: 0; }
    .hdr { display: flex; align-items: flex-start; gap: 16px; }
    .empresa { flex: 1; text-align: center; padding-top: 10px; }
    .empresa h1 { margin: 0; font-size: 36px; font-weight: 800; letter-spacing: 1.5px; }
    .empresa p { margin: 4px 0; font-size: 14px; }
    .empresa .dir { display: inline-flex; align-items: center; gap: 6px; justify-content: center; }
    .pin { flex-shrink: 0; }
    .logo { height: 100px; }
    .folios { width: 152px; }
    .folio-box { border: 2px solid #16387a; border-radius: 8px; overflow: hidden; margin-bottom: 8px; text-align: center; }
    .folio-label { background: #16387a; color: #fff; font-weight: 800; font-size: 14px; padding: 4px 0; letter-spacing: 1px; }
    .folio-val { padding: 7px 6px; font-size: 18px; font-weight: 700; min-height: 20px; }
    .folio-num { color: #d11; }
    .veh { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
    .campo { border: 1px solid #16387a; border-radius: 5px; padding: 6px 9px; font-size: 15px; min-height: 44px; }
    .campo b { display: block; font-size: 11px; }
    .vin { display: flex; align-items: center; gap: 3px; margin: 10px 0; }
    .vin-label { font-weight: bold; margin-right: 8px; font-size: 15px; }
    .vin-celda { display: inline-block; width: 26px; height: 32px; border: 1px solid #16387a; text-align: center; line-height: 32px; font-size: 15px; }
    .legal { font-size: 14px; text-align: justify; margin: 14px 0; line-height: 1.45; }
    .partes { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 16px 0; }
    .parte h3 { text-align: center; margin: 4px 0; font-size: 17px; }
    .parte .linea { border-bottom: 1px solid #16387a; min-height: 24px; font-size: 14px; margin: 9px 0; }
    .total { font-size: 26px; font-weight: bold; margin: 14px 0; }
    .obs { border: 2px solid #16387a; border-radius: 8px; padding: 12px; text-align: center; font-size: 36px; font-weight: bold; opacity: .5; }
    .terminos { font-size: 13px; white-space: pre-line; line-height: 1.45; margin-top: auto; padding-top: 12px; }
    .firma { text-align: center; font-size: 13px; border-top: 1px solid #16387a; margin-top: 30px; padding-top: 4px; }
    .marca-agua { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; }
    .marca-agua img { width: 88%; opacity: 0.06; }
    .contenido { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 250mm; }
  </style></head><body>
    ${marcaAgua}
    <div class="contenido">
    <div class="hdr">
      ${logo}
      <div class="empresa">
        <h1>${esc(nombreContrato)}</h1>
        <p class="dir"><svg class="pin" viewBox="0 0 24 24" width="14" height="14"><path fill="#16387a" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg><span>${esc(s.domicilio)}</span></p>
        <p>${esc(s.ciudadEstado)}</p>
      </div>
      <div class="folios">
        <div class="folio-box">
          <div class="folio-label">FOLIO</div>
          <div class="folio-val folio-num">${esc(v.folio)}</div>
        </div>
        <div class="folio-box">
          <div class="folio-label">FECHA</div>
          <div class="folio-val">${fmtFecha(v.fecha)}</div>
        </div>
      </div>
    </div>

    <div class="veh">
      <div class="campo"><b>AÑO</b>${esc(ve.anio)}</div>
      <div class="campo"><b>MARCA</b>${esc(ve.marca)}</div>
      <div class="campo"><b>MODELO</b>${esc(ve.modelo)}</div>
      <div class="campo"><b>COLOR</b>${esc(ve.color)}</div>
    </div>
    <div class="vin"><span class="vin-label">VIN</span>${vinCeldas(ve.vin)}
      <span style="margin-left:12px" class="campo"><b>PLACA</b>${esc(ve.placa)}</span></div>

    <p class="legal">EL COMPRADOR ADQUIERE LA UNIDAD DESCRITA ANTERIORMENTE EN EL ESTADO QUE SE ENCUENTRA Y ACEPTANDO TODA FUTURA RESPONSABILIDAD CIVIL, PENAL O DE TRÁNSITO A PARTIR DE ESTA FECHA, QUE PUDIERA OCASIONAR CON EL VEHÍCULO. ASÍ MISMO, EL VENDEDOR NO SE HACE RESPONSABLE POR DESCOMPOSTURAS O DEFECTOS DEL VEHÍCULO QUE AL MOMENTO DE LA OPERACIÓN NO SEAN DETECTADOS ASÍ COMO LAS FALLAS MECÁNICAS POSTERIORES DEBIDAS A OMISIONES DEL COMPRADOR.</p>

    <div class="partes">
      <div class="parte"><h3>VENDEDOR</h3>
        <div class="linea">NOMBRE: ${esc(nombreContrato)}</div>
        <div class="linea">DOMICILIO: ${esc(s.domicilio)}</div>
        <div class="linea">COLONIA: ${esc(s.colonia)}</div>
        <div class="linea">CÓDIGO POSTAL: ${esc(s.codigoPostal)}</div>
        <div class="linea">CIUDAD/ESTADO: ${esc(s.ciudadEstado)}</div>
        <div class="firma">FIRMA</div>
      </div>
      <div class="parte"><h3>COMPRADOR</h3>
        <div class="linea">NOMBRE: ${esc(c.nombre)}</div>
        <div class="linea">DOMICILIO: ${esc(c.domicilio)}</div>
        <div class="linea">COLONIA: ${esc(c.colonia)}</div>
        <div class="linea">CÓDIGO POSTAL: ${esc(c.codigoPostal)}</div>
        <div class="linea">CIUDAD/ESTADO: ${esc(c.ciudadEstado)}</div>
        <div class="firma">FIRMA</div>
      </div>
    </div>

    ${(Number(v.descuento) || 0) > 0 ? `<div class="linea">PRECIO DE LISTA: ${fmtMoneda(Number(v.total) + Number(v.descuento))}</div>
    <div class="linea">DESCUENTO: -${fmtMoneda(v.descuento)}</div>` : ''}
    <div class="total">TOTAL ${fmtMoneda(v.total)}</div>
    <div class="obs">${esc(v.observaciones)}</div>
    <div class="terminos"><b>TÉRMINOS Y CONDICIONES:</b>\n${esc(v.terminos)}</div>
    </div>
  </body></html>`;
}

// --- Navegador Chromium reutilizable: se lanza una vez y se apaga tras inactividad. ---
let browserPromise = null;
let idleTimer = null;
const IDLE_MS = 5 * 60 * 1000;

function lanzarBrowser() {
  const puppeteer = require('puppeteer-core');
  return puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function obtenerBrowser() {
  if (!browserPromise) {
    browserPromise = lanzarBrowser();
    const browser = await browserPromise;
    browser.on('disconnected', () => { browserPromise = null; }); // si se cae, se relanza al siguiente uso
  }
  return browserPromise;
}

function programarApagado() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const bp = browserPromise;
    browserPromise = null;
    if (bp) { try { (await bp).close(); } catch (e) { /* ya cerrado */ } }
  }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref(); // no impedir que el proceso termine
}

async function generarContratoPDF(venta) {
  let browser = await obtenerBrowser();
  let page;
  try {
    page = await browser.newPage();
  } catch (e) {
    // El navegador pudo haberse caído: relanzar una vez.
    browserPromise = null;
    browser = await obtenerBrowser();
    page = await browser.newPage();
  }
  try {
    await page.setContent(construirHtmlContrato(venta), { waitUntil: 'networkidle0' });
    // page.pdf() devuelve Uint8Array en puppeteer v23; Express solo envía binario si es Buffer.
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '7mm', bottom: '7mm', left: '8mm', right: '8mm' } });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
    programarApagado();
  }
}

module.exports = { construirHtmlContrato, generarContratoPDF };
