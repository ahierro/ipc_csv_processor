#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, 'EvolucionMoneda.csv');
const OUTPUT = process.argv[3] || path.join(__dirname, 'tipo_de_cambio.csv');

const SEP = ';';
const DECIMALS = 6;

// Parte una linea CSV respetando las comillas dobles: 11/01/2002,--------,"1,600000"
// tiene 3 campos, no 4 (la coma del valor esta dentro de las comillas).
function splitCsv(line) {
  const fields = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; } else { quoted = !quoted; }
    } else if (c === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

// DD/MM/AAAA -> YYYYMMDD, para ordenar sin construir objetos Date.
function sortKey(dateStr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr.trim());
  return m ? `${m[3]}${m[2]}${m[1]}` : null;
}

// "1.498,500000" -> "1498.500000". El origen usa el formato argentino: punto como
// separador de miles y coma como decimal. La salida usa punto decimal y sin miles.
function toDecimal(value) {
  const raw = value.trim();
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw) && !/^-?\d+(,\d+)?$/.test(raw)) return null;

  const [intPart, fracPart = ''] = raw.replace(/\./g, '').split(',');
  const frac = fracPart.slice(0, DECIMALS).padEnd(DECIMALS, '0');
  const n = `${intPart}.${frac}`;
  return Number(n) === 0 ? null : n;
}

const raw = fs.readFileSync(INPUT, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');

if (lines.length === 0) {
  console.error(`El archivo ${INPUT} esta vacio.`);
  process.exit(1);
}

// El origen trae fechas repetidas (5 al dia de hoy) donde la segunda fila es un valor
// anomalo: 06/09/2017 aparece con 17,215000 y con 37,350000, entre vecinos de ~17,2.
// Se conserva la primera aparicion de cada fecha y se avisa por consola.
const quotes = new Map(); // DD/MM/AAAA -> valor ya convertido
const skipped = [];

for (const line of lines) {
  const fields = splitCsv(line);
  const dateStr = (fields[0] || '').trim();

  if (fields.length < 2 || sortKey(dateStr) === null) {
    skipped.push(`fila no reconocida: ${JSON.stringify(line)}`);
    continue;
  }
  // La cotizacion es la ultima columna: el export del BCRA trae la de comprador vacia
  // (`--------`) y solo completa la de cierre vendedor.
  const value = toDecimal(fields[fields.length - 1]);
  if (value === null) {
    skipped.push(`${dateStr}: cotizacion no valida (${JSON.stringify(fields[fields.length - 1])})`);
    continue;
  }

  if (quotes.has(dateStr)) {
    skipped.push(`${dateStr}: fecha repetida, se conserva ${quotes.get(dateStr)} y se descarta ${value}`);
    continue;
  }
  quotes.set(dateStr, value);
}

const out = [...quotes.entries()]
  .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])))
  .map(([dateStr, value]) => `${dateStr}${SEP}${value}`);

fs.writeFileSync(OUTPUT, out.join('\n') + '\n', 'utf8');
console.log(`OK: ${out.length} filas escritas en ${OUTPUT}`);
for (const s of skipped) console.log(`  omitido: ${s}`);
