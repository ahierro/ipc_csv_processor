#!/usr/bin/env node
'use strict';

const path = require('path');
const { procesar } = require('./process_devaluacion');

// Misma cuenta que el pipeline oficial, sobre la serie del blue: cotizacion_blue.csv tiene el
// mismo contrato que tipo_de_cambio.csv, asi que el calculo se reusa entero y aca solo cambian
// los archivos por defecto. La logica vive en process_devaluacion.js, en un solo lugar.
const INPUT = process.argv[2] || path.join(__dirname, 'cotizacion_blue.csv');
const OUTPUT = process.argv[3] || path.join(__dirname, 'devaluacion_mensual_blue.csv');

procesar(INPUT, OUTPUT);
