#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INPUT = process.argv[2] || path.join(__dirname, 'dolarblue.csv');
const OUTPUT = process.argv[3] || path.join(__dirname, 'cotizacion_blue.csv');

const SEP = ';';
const DECIMALS = 6;

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// "Viernes, 21 de agosto del 2026". El origen alterna "de 2026" y "del 2026".
const FECHA_RE = /^([A-Za-zÁÉÍÓÚáéíóúñÑ]+),\s*(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+del?\s+(\d{4})$/;
// "$1.557,50" o "$3,17" o "$1.550". Punto como separador de miles en grupos de 3 y coma
// como decimal: el patron es estricto para que "$1.550" no se pueda leer como 1,55.
const IMPORTE_RE = /^\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?)$/;

// Saca tildes, para comparar el nombre del dia sin depender de como venga acentuado.
function sinAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// DD/MM/AAAA -> YYYYMMDD, para ordenar sin construir objetos Date.
function sortKey(dateStr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
  return m ? `${m[3]}${m[2]}${m[1]}` : null;
}

// Arma DD/MM/AAAA, o null si la fecha no existe en el calendario (31 de febrero y demas).
function toFecha(day, month, year) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null;
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

// "1.557,50" -> "1557.500000". Mismo criterio que process_tipo_de_cambio.js: se sacan los
// miles, la coma pasa a punto y los decimales se completan hasta DECIMALS.
function toDecimal(value) {
  const [intPart, fracPart = ''] = value.replace(/\./g, '').split(',');
  const frac = fracPart.slice(0, DECIMALS).padEnd(DECIMALS, '0');
  const n = `${intPart}.${frac}`;
  return Number(n) === 0 ? null : n;
}

const raw = fs.readFileSync(INPUT, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');

if (lines.length === 0) {
  console.error(`El archivo ${INPUT} esta vacio.`);
  process.exit(1);
}

// El origen no es tabular: es un volcado donde cada registro son dos lineas, la fecha en
// castellano y el importe debajo, separadas por lineas en blanco. Se recorre con un
// pendiente en vez de emparejar por indice, asi un registro incompleto no corre a todos
// los que siguen.
const quotes = new Map(); // DD/MM/AAAA -> valor ya convertido
const skipped = [];
let pendiente = null;

for (const line of lines) {
  const f = FECHA_RE.exec(line);

  if (f) {
    if (pendiente !== null) skipped.push(`${pendiente.linea}: fecha sin importe debajo`);
    pendiente = null;

    const month = MESES[sinAcento(f[3])];
    if (month === undefined) {
      skipped.push(`${line}: mes desconocido`);
      continue;
    }

    const day = Number(f[2]);
    const year = Number(f[4]);
    const fecha = toFecha(day, month, year);
    if (fecha === null) {
      skipped.push(`${line}: fecha inexistente en el calendario`);
      continue;
    }

    // El nombre del dia es redundante, pero si no coincide con la fecha significa que el
    // volcado del origen se corrio. Es la unica validacion cruzada que permite el formato.
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (DIAS[dow] !== sinAcento(f[1])) {
      console.warn(`Aviso en ${line}: esa fecha cae ${DIAS[dow]}.`);
    }

    pendiente = { fecha, linea: line };
    continue;
  }

  const p = IMPORTE_RE.exec(line);
  if (!p) {
    skipped.push(`linea no reconocida: ${JSON.stringify(line)}`);
    continue;
  }
  if (pendiente === null) {
    skipped.push(`${line}: importe sin fecha arriba`);
    continue;
  }

  const value = toDecimal(p[1]);
  if (value === null) {
    skipped.push(`${pendiente.fecha}: cotizacion no valida (${line})`);
  } else if (quotes.has(pendiente.fecha)) {
    skipped.push(`${pendiente.fecha}: fecha repetida, se conserva ${quotes.get(pendiente.fecha)} y se descarta ${value}`);
  } else {
    quotes.set(pendiente.fecha, value);
  }
  pendiente = null;
}

if (pendiente !== null) skipped.push(`${pendiente.linea}: fecha sin importe debajo`);

// El origen viene del mas reciente al mas viejo; la salida va al reves, como tipo_de_cambio.csv.
const out = [...quotes.entries()]
  .sort((a, b) => sortKey(a[0]).localeCompare(sortKey(b[0])))
  .map(([fecha, value]) => `${fecha}${SEP}${value}`);

fs.writeFileSync(OUTPUT, out.join('\n') + '\n', 'utf8');
console.log(`OK: ${out.length} filas escritas en ${OUTPUT}`);
for (const s of skipped) console.log(`  omitido: ${s}`);
