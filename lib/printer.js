import net from 'net';
import sharp from 'sharp';
import { escapeXml } from './security.js';

const LOGO_FETCH_TIMEOUT_MS = 5000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const DEFAULT_LOGO_SVG = `<svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="18" width="104" height="104" rx="20" fill="#4f46e5"/><path d="M70 42l36 14-36 14-36-14 36-14Z" fill="#ffffff"/><path d="M70 64l36 14-36 14-36-14 36-14Z" fill="#e5e7eb"/><path d="M70 54l36 14-36 14-36-14 36-14Z" fill="#cbd5e1"/></svg>`;

const LABELS = {
  en: { welcome: 'Welcome', yourNumber: 'Your number', time: 'Time', wait: 'Est. wait', please: 'Please wait for your turn.', minutes: 'min', track: 'Follow your place in the queue:' },
  no: { welcome: 'Velkommen', yourNumber: 'Nummer', time: 'Tid', wait: 'Est. ventetid', please: 'Vennligst vent på din tur.', minutes: 'min', track: 'Følg køen på mobilen:' },
};

// The logo comes from admin-controlled branding only. data: URLs are decoded locally;
// http(s) URLs are fetched with a timeout and a size cap.
const fetchLogoBuffer = async (logoUrl) => {
  const candidate = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  if (candidate.startsWith('data:')) {
    const base64 = candidate.split(',')[1] || '';
    if (base64) return Buffer.from(base64, 'base64');
  } else if (/^https?:\/\//i.test(candidate)) {
    try {
      const resp = await fetch(candidate, { signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS), redirect: 'error' });
      const length = Number(resp.headers.get('content-length') || 0);
      if (resp.ok && length <= LOGO_MAX_BYTES) {
        const arr = await resp.arrayBuffer();
        if (arr.byteLength <= LOGO_MAX_BYTES) return Buffer.from(arr);
      }
    } catch (err) {
      console.warn('Logo fetch failed', err?.message || err);
    }
  }
  return Buffer.from(DEFAULT_LOGO_SVG);
};

const logoToRaster = async (buf) => {
  try {
    const { data, info } = await sharp(buf)
      .resize({ width: 384, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#FFFFFF' })
      .greyscale()
      .threshold(180)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bytesPerRow = Math.ceil(info.width / 8);
    const raster = Buffer.alloc(bytesPerRow * info.height);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bit = 7 - (x & 7);
        const pixel = data[y * info.width + x];
        if (pixel === 0) raster[byteIndex] |= (1 << bit); // black pixel
      }
    }

    const GS = '\x1d';
    const m = '\x00';
    const xL = String.fromCharCode(bytesPerRow & 0xff);
    const xH = String.fromCharCode((bytesPerRow >> 8) & 0xff);
    const yL = String.fromCharCode(info.height & 0xff);
    const yH = String.fromCharCode((info.height >> 8) & 0xff);
    const header = Buffer.from(`${GS}v0${m}${xL}${xH}${yL}${yH}`, 'binary');
    return Buffer.concat([header, raster]);
  } catch (err) {
    console.warn('Logo rasterization failed', err?.message || err);
    return null;
  }
};

// ESC/POS QR code (GS ( k, model 2). Supported by Epson TM printers and most compatibles.
const escPosQr = (text) => {
  const data = Buffer.from(text, 'latin1');
  const storeLen = data.length + 3;
  const GS = 0x1d;
  return Buffer.concat([
    Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // model 2
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]), // module size 6
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]), // error correction M
    Buffer.from([GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30]),
    data,
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]), // print
    Buffer.from('\n', 'latin1'),
  ]);
};

const buildEscPos = async ({ labels, brandLine, logoUrl, ticketNumber, serviceName, date, waitLine, qrUrl, footer }) => {
  const ESC = '\x1b';
  const GS = '\x1d';
  const reset = ESC + '@';
  const cp1252 = ESC + 't' + '\x10'; // Codepage Windows-1252 for å/ø/æ
  const center = ESC + 'a' + '\x01';
  const left = ESC + 'a' + '\x00';
  const boldOn = ESC + 'E' + '\x01';
  const boldOff = ESC + 'E' + '\x00';
  const doubleOn = GS + '!' + '\x11'; // double height & width
  const doubleOff = GS + '!' + '\x00';
  const cut = GS + 'V' + '\x00';

  const raster = await logoToRaster(await fetchLogoBuffer(logoUrl));

  const parts = [
    Buffer.from(reset + cp1252, 'latin1'),
    raster ? Buffer.from(center, 'latin1') : null,
    raster,
    Buffer.from(center + boldOn + `${brandLine}\n` + boldOff + `${labels.welcome}\n\n`, 'latin1'),
    Buffer.from(boldOn + `${labels.yourNumber}:\n` + boldOff + doubleOn + `${ticketNumber}\n` + doubleOff + '\n', 'latin1'),
    Buffer.from((serviceName ? serviceName + '\n\n' : '\n'), 'latin1'),
    Buffer.from(left + `${labels.time}: ${date}\n` + `${waitLine}\n\n`, 'latin1'),
    Buffer.from(center + `${labels.please}\n`, 'latin1'),
    qrUrl ? Buffer.from(center + `${labels.track}\n`, 'latin1') : null,
    qrUrl ? escPosQr(qrUrl) : null,
    footer ? Buffer.from(center + `${footer}\n`, 'latin1') : null,
    Buffer.from('\n' + cut + '\n', 'latin1'),
  ].filter(Boolean);

  return Buffer.concat(parts);
};

const sendRaw = (host, port, payload) => new Promise((resolve, reject) => {
  const sock = new net.Socket();
  let settled = false;
  const done = (err) => {
    if (settled) return;
    settled = true;
    sock.destroy();
    if (err) reject(err);
    else resolve(true);
  };
  sock.setTimeout(8000);
  sock.once('error', done);
  sock.once('timeout', () => done(new Error('timeout')));
  sock.connect(port, host, () => {
    sock.write(payload, (err) => {
      if (err) return done(err);
      // small delay before closing to ensure flush
      setTimeout(() => done(null), 200);
    });
  });
});

const buildEposXml = ({ labels, brandLine, ticketNumber, serviceName, date, waitLine, qrUrl, footer }) => `
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Body>
          <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
            <text lang="en"/>
            <text align="center"/>
            <text smooth="true"/>
            <text font="font_a" width="1" height="1"/>
            <text>${escapeXml(labels.welcome)}\n</text>
            <text font="font_a" width="2" height="2"/>
            <text>${escapeXml(brandLine)}\n</text>
            <feed line="1"/>
            <text font="font_a" width="1" height="1"/>
            <text>${escapeXml(labels.yourNumber)}:\n</text>
            <text font="font_b" width="4" height="4"/>
            <text>${escapeXml(ticketNumber)}\n</text>
            <feed line="1"/>
            <text font="font_a" width="1" height="1"/>
            <text>${escapeXml(serviceName || '')}\n</text>
            <feed line="1"/>
            <text align="left"/>
            <text font="font_a" width="1" height="1"/>
            <text>${escapeXml(labels.time)}: ${escapeXml(date)}\n</text>
            <text>${escapeXml(waitLine)}\n</text>
            <feed line="2"/>
            <text align="center"/>
            <text>${escapeXml(labels.please)}\n</text>
            ${qrUrl ? `<feed line="1"/><text>${escapeXml(labels.track)}\n</text><symbol type="qrcode_model_2" level="level_m" width="6">${escapeXml(qrUrl)}</symbol>` : ''}
            ${footer ? `<feed line="1"/><text>${escapeXml(footer)}\n</text>` : ''}
            <feed line="1"/>
            <cut type="feed"/>
          </epos-print>
        </s:Body>
      </s:Envelope>
    `;

/**
 * Prints a ticket on a configured network printer: raw ESC/POS on the given port,
 * falling back to Epson ePOS over HTTP. Callers must only pass printers from the
 * admin-managed printer list.
 */
export const printTicket = async ({ printer, ticket, serviceName, waitTime, language, brandText, brandLogoUrl, qrUrl, footer, log = () => {} }) => {
  const host = printer.ipAddress;
  const port = printer.port || 9100;
  const lang = language === 'en' ? 'en' : 'no';
  const labels = LABELS[lang];
  const brandLine = (typeof brandText === 'string' && brandText.replace(/\s+/g, ' ').trim().slice(0, 60)) || 'Q-Flow Pro';
  const date = new Date().toLocaleTimeString(lang === 'en' ? 'en-GB' : 'no-NO', { hour: '2-digit', minute: '2-digit' });
  const waitLine = (waitTime === undefined || waitTime === null)
    ? `${labels.wait}: --`
    : `${labels.wait}: ${waitTime} ${labels.minutes}`;
  const content = {
    labels,
    brandLine,
    logoUrl: brandLogoUrl,
    ticketNumber: String(ticket.number),
    serviceName,
    date,
    waitLine,
    qrUrl: typeof qrUrl === 'string' && qrUrl.length <= 300 ? qrUrl : undefined,
    footer: typeof footer === 'string' ? footer.replace(/\s+/g, ' ').trim().slice(0, 120) : undefined,
  };

  log(`Forbereder utskrift av billett ${ticket.number} (språk=${lang}, brand=${brandLine})`, 'INFO');

  try {
    await sendRaw(host, port, await buildEscPos(content));
    log(`Sendte billett ${ticket.number} til skriver ${host}:${port}`, 'INFO');
    return { ok: true, method: 'raw9100' };
  } catch (rawErr) {
    log(`Utskrift feilet (raw9100) til ${host}:${port}: ${rawErr?.message || rawErr}`, 'ALERT');
  }

  try {
    const url = `http://${host}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=8000`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: buildEposXml(content),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) {
      return { ok: false, method: 'raw9100+epos', error: `http_${response.status}` };
    }
    log(`Sendte billett ${ticket.number} via ePOS til ${host}`, 'INFO');
    return { ok: true, method: 'epos-http' };
  } catch (httpErr) {
    log(`Utskrift feilet (epos-http) til ${host}: ${httpErr?.message || httpErr}`, 'ALERT');
    return { ok: false, method: 'raw9100+epos', error: 'printer_unreachable' };
  }
};
