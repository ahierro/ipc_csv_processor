#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SEP = ';';
const DECIMALS = 10;

// Escala interna. Se trabaja con enteros (BigInt) y no con punto flotante para que el
// truncado a 10 decimales sea exacto: (16.63 / 16.10 - 1) * 100 tiene que dar
// 3.2919254658 y no 3.2919254659 ni 3.2919254657.
const SCALE = 10n ** BigInt(DECIMALS);

// Convierte "16.630000" a un entero escalado a DECIMALS lugares -> 16630000000n.
function toScaled(value) {
  const m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(value.trim());
  if (!m) return null;

  const frac = (m[3] || '').slice(0, DECIMALS).padEnd(DECIMALS, '0');
  const n = BigInt(m[2]) * SCALE + BigInt(frac);
  return m[1] === '-' ? -n : n;
}

// Variacion porcentual de a respecto de b: (a / b - 1) * 100, truncada a DECIMALS
// lugares y siempre con los 10 decimales presentes. Reescrito como (a - b) * 100 / b
// para resolverlo en una sola division entera y sin perder precision.
function variacionPorcentual(a, b) {
  const q = ((a - b) * 100n * SCALE) / b; // division entera de BigInt = truncado
  const abs = q < 0n ? -q : q;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(DECIMALS, '0');
  return `${q < 0n ? '-' : ''}${int}.${frac}`;
}

// Mes calendario inmediatamente anterior a YYYY-MM.
function previousMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Un mes esta cerrado si ya no quedan dias habiles entre la ultima cotizacion y el fin de
// mes. Solo se aplica al ultimo mes del archivo, para no exportar un mes en curso.
function isMonthClosed(monthKey, lastDay) {
  const [year, month] = monthKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let day = lastDay + 1; day <= end; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) return false;
  }
  return true;
}

// Lee una serie diaria en el formato de tipo_de_cambio.csv (DD/MM/AAAA;cotizacion) y escribe
// su variacion mensual en YYYY-MM;porcentaje. Sirve para cualquier serie con ese contrato:
// hoy la usan el dolar oficial y el blue (ver process_devaluacion_blue.js).
function procesar(INPUT, OUTPUT) {
  const raw = fs.readFileSync(INPUT, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    console.error(`El archivo ${INPUT} esta vacio.`);
    process.exit(1);
  }

  // Ultima cotizacion de cada mes: se recorre en orden y cada fecha posterior pisa a la
  // anterior, asi el cierre no depende de que el archivo llegue al ultimo dia calendario.
  const closes = new Map(); // YYYY-MM -> { day, value }

  for (const line of lines) {
    const [dateStr, valueStr] = line.split(SEP);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dateStr || '').trim());
    if (!m) {
      console.warn(`Fecha no reconocida, se ignora: ${JSON.stringify(line)}`);
      continue;
    }

    const value = toScaled(valueStr || '');
    if (value === null || value === 0n) {
      console.warn(`Cotizacion no valida en ${dateStr}, se ignora.`);
      continue;
    }

    const key = `${m[3]}-${m[2]}`;
    const day = Number(m[1]);
    const prev = closes.get(key);
    if (!prev || day >= prev.day) closes.set(key, { day, value });
  }

  const months = [...closes.keys()].sort();
  const lastMonth = months[months.length - 1];
  const out = [];
  const skipped = [];

  for (const month of months) {
    if (month === lastMonth && !isMonthClosed(month, closes.get(month).day)) {
      skipped.push(`${month} (mes sin cerrar, ultimo dato ${closes.get(month).day})`);
      continue;
    }

    const prevKey = previousMonth(month);
    if (!closes.has(prevKey)) {
      skipped.push(`${month} (falta el cierre de ${prevKey})`);
      continue;
    }

    // La clave del mes ya viene en YYYY-MM: es tal cual la primera columna de la salida.
    out.push(`${month}${SEP}${variacionPorcentual(closes.get(month).value, closes.get(prevKey).value)}`);
  }

  fs.writeFileSync(OUTPUT, out.join('\n') + '\n', 'utf8');
  console.log(`OK: ${out.length} filas escritas en ${OUTPUT}`);
  for (const s of skipped) console.log(`  omitido: ${s}`);
}

module.exports = { procesar };

if (require.main === module) {
  procesar(
    process.argv[2] || path.join(__dirname, 'tipo_de_cambio.csv'),
    process.argv[3] || path.join(__dirname, 'devaluacion_mensual.csv'),
  );
}
