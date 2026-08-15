#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, 'ipc.csv');
const OUTPUT = process.argv[3] || path.join(__dirname, 'ipc_processed.csv');

const COLUMNS = ['indice_tiempo', 'ipc_ng_nacional_tasa_variacion_mensual'];
const SEP = ';';
// Primer mes que se exporta (inclusive). Ver README: antes de 06/2017 el IPC nacional
// no tiene cobertura completa y no es comparable contra otras fuentes.
const START_MONTH = '2017-06';

// Devuelve el ultimo dia del mes en DD/MM/AAAA (contempla 28/29/30/31).
function lastDayOfMonth(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;

  const year = Number(m[1]);
  const month = Number(m[2]);
  // Dia 0 del mes siguiente = ultimo dia del mes actual (JS ajusta bisiestos y fin de anio).
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${String(day).padStart(2, '0')}/${m[2]}/${m[1]}`;
}

// Mes (YYYY-MM) de una fecha del origen; null si no matchea el formato esperado.
function sourceMonth(dateStr) {
  const m = /^(\d{4}-\d{2})-/.exec(dateStr.trim());
  return m ? m[1] : null;
}

// Pasa la tasa a porcentaje (x100). Los valores vacios quedan vacios.
function toPercent(value) {
  if (value === '') return '';

  const n = Number(value);
  if (!Number.isFinite(n)) return value;

  // El x100 sobre binario arrastra ruido (1.5858999999999845); se recorta sin perder precision util.
  return String(Number((n * 100).toFixed(10)));
}

const raw = fs.readFileSync(INPUT, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');

if (lines.length === 0) {
  console.error(`El archivo ${INPUT} esta vacio.`);
  process.exit(1);
}

const header = lines[0].split(',');
const indexes = COLUMNS.map((name) => {
  const i = header.indexOf(name);
  if (i === -1) {
    console.error(`No se encontro la columna "${name}" en ${INPUT}.`);
    process.exit(1);
  }
  return i;
});

const out = [];

for (let i = 1; i < lines.length; i++) {
  const fields = lines[i].split(',');
  const row = indexes.map((idx) => (fields[idx] || '').trim());
  const month = sourceMonth(row[0]);
  if (month === null || month < START_MONTH) continue;
  row[0] = lastDayOfMonth(row[0]);
  row[1] = toPercent(row[1]);
  out.push(row.join(SEP));
}

fs.writeFileSync(OUTPUT, out.join('\n') + '\n', 'utf8');
console.log(`OK: ${out.length} filas escritas en ${OUTPUT}`);
