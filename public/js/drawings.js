// Schematic SVG drawings for window / door models. Pure functions → SVG strings.

export const KINDS = {
  fix: 'Fixed window', hinged1: 'Single hinged', hinged2: 'Two-leaf hinged', bottom: 'Bottom hinged', tilt: 'Tilt & turn',
  sliding2: 'Sliding – 2 panels', sliding3: 'Sliding – 3 panels', sliding4: 'Sliding – 4 panels',
  door1: 'Single swing door', door2: 'Double swing door', partition: 'Frameless / partition',
};

export function drawModel(kind, w = 100, h = 100, { dims = true } = {}) {
  w = Number(w) || 100; h = Number(h) || 100;
  const M = 150; const k = M / Math.max(w, h);
  const W = Math.max(40, w * k), H = Math.max(40, h * k);
  const pad = dims ? 26 : 8; const ox = pad, oy = 8;
  const vw = W + pad + 14, vh = H + oy + (dims ? 26 : 8);
  const ft = 5; // frame thickness
  const glass = 'fill="#cfe6f7" stroke="#26435f" stroke-width="1"';
  const line = 'stroke="#26435f" stroke-width="1" fill="none"';
  const dash = 'stroke="#26435f" stroke-width="1" fill="none" stroke-dasharray="4 3"';
  const x0 = ox, y0 = oy, x1 = ox + W, y1 = oy + H;
  let s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#9aa7b5" stroke="#26435f" stroke-width="1.5"/>`;
  const pane = (x, y, ww, hh) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" ${glass}/>`;
  const ix = x0 + ft, iy = y0 + ft, iw = W - 2 * ft, ih = H - 2 * ft;
  const tri = (x, y, ww, hh, hinge) => { // dashed opening symbol, apex on the hinge side
    if (hinge === 'L') return `<path d="M${x + ww} ${y} L${x} ${y + hh / 2} L${x + ww} ${y + hh}" ${dash}/>`;
    if (hinge === 'R') return `<path d="M${x} ${y} L${x + ww} ${y + hh / 2} L${x} ${y + hh}" ${dash}/>`;
    if (hinge === 'B') return `<path d="M${x} ${y} L${x + ww / 2} ${y + hh} L${x + ww} ${y}" ${dash}/>`;
    return `<path d="M${x} ${y + hh} L${x + ww / 2} ${y} L${x + ww} ${y + hh}" ${dash}/>`;
  };
  const arrow = (x, y, dir) => `<path d="M${x} ${y} h${dir * 22} m${-dir * 6} -4 l${dir * 6} 4 l${-dir * 6} 4" ${line} stroke-width="1.6"/>`;
  const handle = (x, y) => `<rect x="${x - 1.5}" y="${y - 7}" width="3" height="14" rx="1.5" fill="#26435f"/>`;

  switch (kind) {
    case 'fix':
      s += pane(ix, iy, iw, ih) + `<path d="M${ix + 10} ${iy + ih - 8} L${ix + 40} ${iy + 8}" stroke="#fff" stroke-width="3" opacity=".7"/>`;
      break;
    case 'hinged1': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'L') + handle(ix + iw - 8, y0 + H / 2); break;
    case 'bottom': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'B') + handle(x0 + W / 2, iy + 8); break;
    case 'tilt': s += pane(ix, iy, iw, ih) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'L') + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'B') + handle(ix + iw - 8, y0 + H / 2); break;
    case 'hinged2': {
      const m = ix + iw / 2;
      s += pane(ix, iy, iw / 2 - 1, ih) + pane(m + 1, iy, iw / 2 - 1, ih) + tri(ix + 3, iy + 3, iw / 2 - 7, ih - 6, 'L') + tri(m + 4, iy + 3, iw / 2 - 7, ih - 6, 'R') + handle(m - 5, y0 + H / 2) + handle(m + 5, y0 + H / 2);
      break;
    }
    case 'sliding2': case 'sliding3': case 'sliding4': {
      const n = Number(kind.slice(-1)); const ov = 4; const pw = (iw + ov * (n - 1)) / n;
      for (let i = 0; i < n; i++) s += `<rect x="${ix + i * (pw - ov)}" y="${iy + (i % 2 ? 0 : 0)}" width="${pw}" height="${ih}" ${glass} fill-opacity="${i % 2 ? 1 : .75}"/>` + `<rect x="${ix + i * (pw - ov) + 1.5}" y="${iy + 1.5}" width="${pw - 3}" height="${ih - 3}" ${line} stroke-opacity=".35"/>`;
      s += arrow(ix + 8, y0 + H / 2, 1) + arrow(ix + iw - 8, y0 + H / 2, -1);
      break;
    }
    case 'door1':
      s += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#e9eef4" stroke="#26435f"/>` + pane(ix + iw * .18, iy + ih * .08, iw * .64, ih * .5) + `<rect x="${ix + iw * .18}" y="${iy + ih * .64}" width="${iw * .64}" height="${ih * .26}" fill="#cfd8e2" stroke="#26435f"/>` + handle(ix + iw - 7, y0 + H * .55) + tri(ix + 4, iy + 4, iw - 8, ih - 8, 'L');
      break;
    case 'door2': {
      const m = ix + iw / 2;
      for (const [x, ww] of [[ix, iw / 2 - 1], [m + 1, iw / 2 - 1]]) s += `<rect x="${x}" y="${iy}" width="${ww}" height="${ih}" fill="#e9eef4" stroke="#26435f"/>` + pane(x + ww * .16, iy + ih * .08, ww * .68, ih * .5) + `<rect x="${x + ww * .16}" y="${iy + ih * .64}" width="${ww * .68}" height="${ih * .26}" fill="#cfd8e2" stroke="#26435f"/>`;
      s += handle(m - 5, y0 + H * .55) + handle(m + 5, y0 + H * .55) + tri(ix + 3, iy + 3, iw / 2 - 7, ih - 6, 'L') + tri(m + 4, iy + 3, iw / 2 - 7, ih - 6, 'R');
      break;
    }
    case 'partition':
      s = `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" ${glass} stroke-width="1.5"/><path d="M${x0 + 12} ${y1 - 10} L${x0 + 44} ${y0 + 10}" stroke="#fff" stroke-width="3" opacity=".7"/>`;
      break;
    default: s += pane(ix, iy, iw, ih);
  }
  if (dims) {
    const tx = '#55627a';
    s += `<line x1="${x0}" y1="${y1 + 10}" x2="${x1}" y2="${y1 + 10}" stroke="${tx}" stroke-width=".8"/><text x="${x0 + W / 2}" y="${y1 + 21}" font-size="10" text-anchor="middle" fill="${tx}">${+w.toFixed(1)}</text>`;
    s += `<line x1="${x0 - 10}" y1="${y0}" x2="${x0 - 10}" y2="${y1}" stroke="${tx}" stroke-width=".8"/><text transform="translate(${x0 - 14} ${y0 + H / 2}) rotate(-90)" font-size="10" text-anchor="middle" fill="${tx}">${+h.toFixed(1)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${KINDS[kind] || 'Model'} drawing">${s}</svg>`;
}
