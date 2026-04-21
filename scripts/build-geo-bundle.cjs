/**
 * Újragenerálja a település-határ .bundle.js fájlt a .geojson-ból (file:// és böngésző kompatibilitás).
 * Futtatás: node scripts/build-geo-bundle.cjs
 */
const fs = require('fs');
const path = require('path');

const name = 'magyarorszag_telepulesek_kozigazgatasi_hatarai_egyszerusitett';
const root = path.join(__dirname, '..');
const src = path.join(root, 'data', name + '.geojson');
const dst = path.join(root, 'data', name + '.bundle.js');

const json = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dst, 'window.__HSE_SETTLEMENT_BOUNDARIES=' + json + ';\n', 'utf8');
console.log('OK', dst, fs.statSync(dst).size, 'bytes');
