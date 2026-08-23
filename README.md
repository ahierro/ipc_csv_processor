# ipc_csv_processor

Toma datos de **inflación** (INDEC vía datos.gob.ar), de **tipo de cambio oficial** (BCRA) y de
**dólar blue**, y los convierte en CSV chicos y uniformes, para que otro programa los consuma y
los pueda cruzar directamente.

| # | Pipeline | Origen | Script | Salida |
|---|---|---|---|---|
| 1 | Inflación mensual | `ipc.csv` | `process_ipc.js` | `ipc_processed.csv` |
| 2 | Tipo de cambio diario | `EvolucionMoneda.csv` | `process_tipo_de_cambio.js` | `tipo_de_cambio.csv` |
| 3 | Devaluación mensual | `tipo_de_cambio.csv` | `process_devaluacion.js` | `devaluacion_mensual.csv` |
| 4 | Cotización blue diaria | `dolarblue.csv` | `process_cotizacion_blue.js` | `cotizacion_blue.csv` |
| 5 | Devaluación mensual blue | `cotizacion_blue.csv` | `process_devaluacion_blue.js` | `devaluacion_mensual_blue.csv` |

Son dos cadenas de dos pasos —normalizar la serie diaria, después pasarla a mensual— más el
pipeline de inflación, que es independiente. Las dos cadenas usan **el mismo código** para el
segundo paso: `process_devaluacion_blue.js` importa `procesar()` de `process_devaluacion.js`.

Las dos series **diarias** —`tipo_de_cambio.csv` y `cotizacion_blue.csv`— comparten contrato
exacto: sin encabezado, `;`, fecha en `DD/MM/AAAA` y cotización con 6 decimales. Se cruzan por
fecha sin ninguna conversión.

Las tres salidas **mensuales** comparten casi todo el contrato: sin encabezado, separadas por
`;`, una fila por mes y el valor en **porcentaje** con `.` como separador decimal. La de
inflación difiere en cómo etiqueta el mes:

| Salida | Primera columna | Ejemplo | Cobertura |
|---|---|---|---|
| `ipc_processed.csv` | `DD/MM/AAAA`, último día del mes | `30/06/2017` | 110 meses, 06/2017 → 07/2026 |
| `devaluacion_mensual.csv` | `YYYY-MM` | `2017-06` | 294 meses, 02/2002 → 07/2026 |
| `devaluacion_mensual_blue.csv` | `YYYY-MM` | `2008-02` | 222 meses, 02/2008 → 07/2026 |

Las dos de devaluación se cruzan entre sí sin tocar nada. Para sumarles la inflación hay que
normalizar la clave: `30/06/2017` ↔ `2017-06` es una reescritura directa, sin ambigüedad,
porque las dos identifican el mismo mes calendario.

## Uso

```bash
node process_ipc.js
```

```bash
node process_tipo_de_cambio.js
```

```bash
node process_devaluacion.js
```

```bash
node process_cotizacion_blue.js
```

```bash
node process_devaluacion_blue.js
```

Cada script lee su origen y escribe su salida en el mismo directorio. Los cinco aceptan
rutas alternativas como argumentos:

```bash
node process_ipc.js entrada.csv salida.csv
```

---

# 1. Inflación mensual

## Fuente

`ipc.csv` se descarga de:

<https://infra.datos.gob.ar/catalog/sspm/dataset/145/distribution/145.3/download/indice-precios-al-consumidor-nivel-general-base-diciembre-2016-mensual.csv>

Es el **Índice de Precios al Consumidor, nivel general, base diciembre 2016, frecuencia
mensual**. Trae 22 columnas: el índice y sus tasas de variación (mensual, y acumulada desde
diciembre del año anterior) para el total nacional y para cada región — GBA, Pampeana, NEA,
NOA, Cuyo y Patagonia. De todo eso nos interesan solo dos columnas.

## Formato de salida

`ipc_processed.csv`:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Fecha | `30/06/2017` | Último día del mes, `DD/MM/AAAA` |
| 2 | Inflación | `1.1920734714` | Variación del mes, en **porcentaje** |

```
30/06/2017;1.1920734714
31/07/2017;1.7322662871
...
31/07/2026;2.1137724268
```

## Transformaciones aplicadas

- Se toman únicamente `indice_tiempo` y `ipc_ng_nacional_tasa_variacion_mensual`.
- El separador pasa de `,` a `;`.
- Se elimina la fila de encabezado.
- El valor se multiplica por 100: el origen trae la tasa en fracción (`0.011920…`) y la
  salida la expresa en porcentaje (`1.1920…`). El resultado se recorta a 10 decimales
  porque multiplicar por 100 en punto flotante binario arrastra ruido — `0.015859 * 100`
  da `1.5858999999999845`.
- La fecha pasa del día 1 al último día del mes.
- Se descartan los meses anteriores a junio de 2017.

## Por qué la fecha es el último día del mes

El origen fecha cada registro con el **día 1 del mes** (`2017-06-01`). Eso es una convención
de etiquetado: marca a qué mes pertenece el dato, no cuándo ocurrió.

Pero el valor de la columna no es la inflación del día 1: es la **inflación acumulada a lo
largo de todo el mes**, medida contra el mes anterior. Es un dato que recién queda completo
cuando el mes terminó. Fecharlo el día 1 hace que cualquier programa que lo consuma —un
gráfico, un cálculo de acumulados, un join contra otra serie— ubique el valor al principio
de un período que todavía no había transcurrido.

Por eso movemos la fecha al último día del mismo mes: `2017-06-01` → `30/06/2017`. Así la
fecha coincide con el momento en que el acumulado del mes está efectivamente cerrado.

El pipeline de devaluación resuelve lo mismo por otra vía: en vez de mover la fecha al cierre
del período, etiqueta la fila con el mes a secas (`2017-06`), que no afirma nada sobre ningún
día en particular. Las dos convenciones son equivalentes a la hora de cruzar los archivos; ver
§3.

El último día se calcula con `new Date(Date.UTC(year, month, 0))` — el día 0 del mes
siguiente es el último del mes actual, lo que hace que JavaScript resuelva solo los meses de
31, 30 y 28 días, **incluidos los bisiestos**: `29/02/2020` y `29/02/2024` salen correctos
sin ninguna regla especial.

## Por qué la serie arranca en junio de 2017

El origen empieza en diciembre de 2016, pero la salida descarta todo lo anterior a **junio
de 2017**. Hay dos motivos, uno menor y uno importante.

**El mes base no tiene dato.** Diciembre de 2016 es el mes base del índice (valor 100). Al
ser el punto de partida no tiene mes anterior contra el cual comparar, así que su celda de
variación mensual viene **vacía**. Una fila con fecha pero sin valor obliga a todo consumidor
del archivo a manejar un caso especial, y no aporta nada.

**El IPC nacional no es comparable antes de junio de 2017.** Este es el motivo de fondo. El
IPC **nacional** del INDEC recién alcanza cobertura completa hacia mediados de 2017. Antes
de eso, lo habitual en otras publicaciones de inflación era informar la serie de **GBA**,
que es una medición distinta. El resultado es que entre enero y mayo de 2017 esta columna y
otras fuentes discrepan de forma apreciable, porque no están midiendo lo mismo:

| Mes | Nacional | GBA | BCRA (`inflacionmensual.csv`) |
|---|---|---|---|
| 01/2017 | 1,59 | 1,31 | 1,3 ← sigue a GBA |
| 02/2017 | 2,07 | 2,46 | 2,5 ← sigue a GBA |
| 05/2017 | 1,43 | 1,28 | 1,3 ← sigue a GBA |
| 06/2017 | 1,19 | 1,39 | 1,2 ← sigue a nacional |

A partir de junio de 2017 las otras fuentes pasan a seguir la serie nacional y las
diferencias desaparecen. Como el archivo de salida está pensado para cruzarse contra datos
de inflación, arrastrar cinco meses que responden a una medición distinta sería una fuente
silenciosa de error. Se cortan.

Si en algún momento hiciera falta la serie completa desde enero de 2017, alcanza con cambiar
la constante `START_MONTH` en `process_ipc.js`, teniendo presente la salvedad de arriba.

## Validación contra el BCRA

La salida se contrastó mes a mes contra `inflacionmensual.csv`, que es una serie de una
**fuente distinta**: el BCRA (Banco Central de la República Argentina), publicada en su
sección de principales variables como *Inflación mensual (variación en %)*, serie 7931:

<https://www.bcra.gob.ar/principales-variables-datos/?serie=7931&detalle=Inflaci%C3%B3n+mensual+%28variaci%C3%B3n+en+%25%29>

Viene en formato `DD/MM/AAAA;valor`, sin encabezado, ya expresada en porcentaje y
**redondeada a un decimal**. Sirve como control cruzado independiente: si la transformación
de este proyecto tuviera un error de escala, de corrimiento de mes o de columna, el
contraste contra el BCRA lo delataría.

Sobre los **110 meses** de 06/2017 a 07/2026:

- Diferencia absoluta **máxima: 0,05 pp**; media 0,025 pp.
- Sesgo medio: +0,0035 pp — ninguna de las dos series corre sistemáticamente por encima de
  la otra.
- El 100 % de los meses coincide al redondear a un decimal.

Esa diferencia residual de ~0,03 pp es puro **redondeo**: el BCRA publica con un decimal y
esta salida conserva diez. No hay discrepancia de datos — ambas series reflejan el mismo IPC
del INDEC, solo que con distinta precisión.

---

# 2. Tipo de cambio diario

## Fuente

`EvolucionMoneda.csv` es el archivo que se baja del BCRA, en *Evolución de una moneda*:

<https://www.bcra.gob.ar/evolucion-moneda>

Recorrido: **Dólar estadounidense → Mercado de cambios, cotizaciones cierre vendedor**.

Es el export crudo, tal cual sale del sitio: sin encabezado, separado por `,`, con BOM, la
fecha en `DD/MM/AAAA`, una columna del medio siempre vacía (`--------`) y la cotización
entrecomillada en **formato argentino** — punto como separador de miles y coma como decimal:

```
11/01/2002,--------,"1,600000"
...
21/08/2026,--------,"1.499,000000"
```

Arranca en **enero de 2002**, con la salida de la convertibilidad.

## Formato de salida

`tipo_de_cambio.csv`:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Fecha | `11/01/2002` | Día hábil, `DD/MM/AAAA` |
| 2 | Cotización | `1.600000` | Cierre vendedor, 6 decimales |

```
11/01/2002;1.600000
14/01/2002;1.600000
...
21/08/2026;1499.000000
```

Son **6032 filas**, de `11/01/2002` a `21/08/2026`. No es una salida final: es la entrada de
`process_devaluacion.js`.

## Transformaciones aplicadas

- El separador pasa de `,` a `;` y se elimina el BOM.
- Se descarta la columna del medio: el export trae la de comprador vacía (`--------`) y solo
  completa la de cierre vendedor, que es la última.
- El número pasa de formato argentino a decimal con punto: `"1.499,000000"` → `1499.000000`.
  Se conservan los 6 decimales del origen aunque sean ceros. Las comillas ya no hacen falta:
  sin la coma decimal adentro, no hay ambigüedad con el separador.
- Las filas se emiten ordenadas por fecha ascendente.

## Alcance: la historia completa

Se exporta **todo** lo que trae el origen, desde el `11/01/2002`. No hay corte por fecha: la
única razón por la que una fila del origen no llegue a la salida es que no se la pueda parsear
o que repita una fecha ya vista.

La contrapartida es que los dos archivos finales dejan de cubrir el mismo período.
`ipc_processed.csv` arranca en 06/2017 —el IPC nacional no es comparable antes, ver §1— y
`devaluacion_mensual.csv` arranca en 02/2002: 294 meses en vez de 110. Cruzarlos sigue siendo
directo, pero el join tiene que tolerar 184 meses con devaluación y sin inflación.

A diferencia del pipeline de inflación, acá no hay una constante de recorte: el filtrado, si
hace falta, es del consumidor.

## Fechas repetidas en el origen

El export del BCRA trae fechas duplicadas, y la segunda fila del par es siempre un valor fuera
de escala:

```
05/09/2017,--------,"17,240000"
06/09/2017,--------,"17,215000"   <- se conserva
06/09/2017,--------,"37,350000"   <- se descarta
07/09/2017,--------,"17,200000"
```

`37,35` entre vecinos de `17,2` no es una cotización, es ruido del origen. El script conserva
la **primera** aparición de cada fecha y avisa por consola cuál descartó. En los 24 años del
archivo hay exactamente cinco casos, y los cinco se informan:

```
OK: 6032 filas escritas en tipo_de_cambio.csv
  omitido: 26/05/2006: fecha repetida, se conserva 3.079000 y se descarta 3.088000
  omitido: 02/03/2007: fecha repetida, se conserva 3.085000 y se descarta 3.100000
  omitido: 17/10/2008: fecha repetida, se conserva 3.212000 y se descarta 3.316000
  omitido: 22/11/2016: fecha repetida, se conserva 15.450000 y se descarta 15.730000
  omitido: 06/09/2017: fecha repetida, se conserva 17.215000 y se descarta 37.350000
```

En los cinco, el valor descartado se despega de sus vecinos y el conservado sigue la serie.

## Validación contra el archivo anterior

`tipo_de_cambio.csv` existía antes que este script: estaba armado a mano y cubría de
`31/05/2017` a `14/08/2026`. La salida generada coincide **fila por fila y valor por valor**
con esa versión en todo ese rango —las 2242 filas, incluida la fecha duplicada de septiembre de
2017, que el archivo hecho a mano también resolvía quedándose con la primera—. Lo que se suma
es historia: **3786 filas hacia atrás**, hasta `11/01/2002`, y cuatro días nuevos al final
(`18/08/2026` a `21/08/2026`). El BOM ya no se emite, igual que en las otras dos salidas.

Aguas abajo el efecto es puramente aditivo: sobre esta entrada, `process_devaluacion.js`
reproduce los 110 meses anteriores **con los mismos valores exactos** y les antepone 184.

---

# 3. Devaluación mensual

## Fuente

`tipo_de_cambio.csv`, la salida del pipeline anterior: una serie **diaria** de días hábiles,
en formato `DD/MM/AAAA;cotización`, sin encabezado y con seis decimales:

```
31/05/2017;16.100000
01/06/2017;16.060000
02/06/2017;16.000000
```

## Formato de salida

`devaluacion_mensual.csv`:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Mes | `2017-06` | Mes calendario, `YYYY-MM` |
| 2 | Devaluación | `3.2919254658` | Variación del mes, en **porcentaje**, 10 decimales |

```
2002-02;4.8780487804
2002-03;39.5348837209
...
2017-06;3.2919254658
2017-07;6.0733613950
2017-08;-1.8707482993
2017-09;0.0000000000
...
2026-07;0.2024291497
```

Son **294 filas**, de `2002-02` a `2026-07`.

## Por qué la fecha es `YYYY-MM` y no un día

El dato es mensual: no ocurre en una fecha, corresponde a un período. Cualquier día que se
elija para representarlo —el primero, el último, el del cierre efectivo del mercado— es una
convención que después hay que explicar y que el consumidor tiene que deshacer para volver a
agrupar por mes.

`YYYY-MM` dice exactamente lo que el dato es y nada más. Además ordena alfabéticamente igual
que cronológicamente, lo que hace que un `sort` sobre el archivo crudo ya lo deje en orden, y
elimina la ambigüedad `DD/MM` vs `MM/DD` al importarlo en otra herramienta.

El pipeline de inflación conserva `DD/MM/AAAA` con el último día del mes (ver §1). Para
cruzar los dos archivos hay que reescribir una de las dos claves; la equivalencia es
uno a uno.

## Cómo se calcula

Se pasa de una serie diaria a una mensual. Para cada mes se toma su **cotización de cierre**
y se la compara contra la del mes anterior:

```
devaluación = (cierre_mes / cierre_mes_anterior - 1) × 100
```

Con el ejemplo de arriba — mayo cierra en `16.100000` y junio en `16.630000`:

```
(16.63 / 16.10 - 1) × 100 = 3.2919254658
```

Los meses en que el peso se apreció salen **negativos** (`-1.8707482993` en agosto de 2017),
y los 10 decimales están siempre presentes aunque el valor sea redondo
(`0.0000000000` en septiembre de 2017, que cerró igual que agosto).

## Detalles de implementación

**El cierre es la última cotización disponible, no el último día calendario.** El mercado no
opera sábados, domingos ni feriados, así que un mes puede terminar sin cotización ese día.
Septiembre de 2017, por ejemplo, cierra el viernes 29. El script recorre el mes y se queda
con la última fecha presente. Qué día haya sido no llega a la salida: la fila se emite como
`2017-09`, y el día solo se usa internamente para decidir si el mes está cerrado.

**El cálculo usa enteros, no punto flotante.** Las cotizaciones se convierten a enteros
`BigInt` escalados y la cuenta se resuelve como `(a - b) × 100 / b` en una única división
entera. Esto importa porque el resultado se **trunca** a 10 decimales, y truncar sobre punto
flotante es frágil: el valor real del ejemplo es `3.29192546583…`, y basta un bit de ruido
binario para que el décimo decimal salga mal. Con aritmética entera el corte es exacto y
reproducible.

**Se exige que el mes anterior sea el inmediatamente previo.** Si faltara un mes entero en el
origen, el script no compara contra un mes lejano: omite la fila y avisa.

**No se exporta un mes en curso.** Antes de emitir el último mes del archivo, el script
verifica si todavía quedan días hábiles entre la última cotización y el fin de mes. Si
quedan, el mes no está cerrado y se omite: una devaluación parcial publicada como el dato del
mes sería un dato falso. Hoy el origen llega al `21/08/2026`, así que agosto de 2026 queda
afuera.

Todo mes omitido se informa por consola con su motivo, para que ninguna fila desaparezca en
silencio:

```
OK: 294 filas escritas en devaluacion_mensual.csv
  omitido: 2002-01 (falta el cierre de 2001-12)
  omitido: 2026-08 (mes sin cerrar, ultimo dato 21)
```

Enero de 2002 es el primer mes del origen y no tiene un mes anterior contra el cual comparar,
así que la serie efectivamente arranca en **febrero de 2002**.

---

# 4. Cotización del dólar blue

## Fuente

`dolarblue.csv` no es un CSV: es el volcado de una página guardado con esa extensión. Cada
registro ocupa dos líneas —la fecha escrita en castellano y el importe debajo—, separadas por
líneas en blanco, con saltos CRLF y en orden **del más reciente al más viejo**:

```
Viernes, 21 de agosto del 2026

$1.550

Jueves, 20 de agosto del 2026

$1.557,50
```

Son 2268 registros de días hábiles, del `02/01/2008` al `21/08/2026`.

## Formato de salida

`cotizacion_blue.csv` usa **el mismo contrato que `tipo_de_cambio.csv`**, campo por campo:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Fecha | `02/01/2008` | Día hábil, `DD/MM/AAAA` |
| 2 | Cotización | `3.170000` | Dólar blue, 6 decimales |

```
02/01/2008;3.170000
04/01/2008;3.170000
...
21/08/2026;1550.000000
```

Son **2268 filas**. Al compartir formato con el oficial, las dos series diarias se cruzan por
fecha sin conversión, y el pipeline de devaluación se reusa tal cual sobre esta — que es lo que
hace §5.

## Transformaciones aplicadas

- Se arma un registro por cada par fecha/importe; las líneas en blanco se descartan.
- La fecha en castellano pasa a `DD/MM/AAAA`: `Viernes, 21 de agosto del 2026` → `21/08/2026`.
  El origen alterna `de 2026` y `del 2026`, y los dos se aceptan.
- El importe pasa de formato argentino a decimal con punto, completado a 6 decimales:
  `$1.557,50` → `1557.500000`, `$3,17` → `3.170000`, `$1.550` → `1550.000000`.
- Se invierte el orden: el origen va del más reciente al más viejo, la salida al revés.

**`$1.550` es mil quinientos cincuenta, no uno con cincuenta y cinco.** El punto es separador
de miles. El patrón que valida el importe exige que cada grupo tenga exactamente tres dígitos,
así que un `$1.55` —que sería ambiguo— no pasaría como válido: quedaría omitido y avisado, en
vez de colarse convertido a un valor mil veces menor.

## El nombre del día como control

El formato no trae ninguna columna redundante con la cual detectar un volcado corrido, salvo
una: el nombre del día. `Viernes, 21 de agosto del 2026` afirma dos cosas a la vez y se pueden
contrastar entre sí — si el 21/08/2026 no cayera viernes, el volcado estaría desalineado. El
script hace esa cuenta en cada registro y avisa por consola cuando no coinciden.

El emparejamiento fecha/importe tampoco se hace por índice sino con un pendiente: si a una
fecha le faltara el importe, se omite ese registro y se avisa, en vez de correr un lugar a
todos los que siguen.

## Validación

Sobre el archivo actual el script no omite ni avisa nada, y los controles dan:

- Los **2268** registros del origen llegan a la salida con su valor exacto — round-trip
  completo, sin faltantes ni diferencias.
- Los 2268 nombres de día **coinciden** con su fecha. Ninguna cae sábado o domingo, ninguna es
  inexistente en el calendario y ninguna está repetida.
- 2266 de las 2268 fechas existen también en `tipo_de_cambio.csv`. Las dos que no —`10/07/2009`
  y `02/09/2013`— son días en que el blue operó y el BCRA no publicó.
- La brecha contra el oficial promedia **32,6 %** y toca un máximo de **214,3 %** el
  `24/10/2023` (blue `1100` contra oficial `349.95`), dos días después de las elecciones
  generales. En 61 días el blue quedó por debajo del oficial, con un mínimo de −3,9 %. El signo
  y la magnitud siguen la historia conocida del cepo, lo que descarta un error de escala o un
  corrimiento de fechas.

---

# 5. Devaluación mensual del blue

## Fuente

`cotizacion_blue.csv`, la salida de §4. Como tiene el mismo contrato que `tipo_de_cambio.csv`,
el cálculo es literalmente **el mismo código**: `process_devaluacion_blue.js` no reimplementa
nada, importa `procesar()` de `process_devaluacion.js` y solo cambia los archivos por defecto.

```js
const { procesar } = require('./process_devaluacion');
procesar(INPUT, OUTPUT);
```

Así hay una sola implementación de la aritmética `BigInt`, del criterio de cierre de mes y del
control de mes en curso; todo lo explicado en §3 vale igual acá. `process_devaluacion.js` sigue
funcionando como script suelto, y su salida no cambió ni un byte con el refactor.

## Formato de salida

`devaluacion_mensual_blue.csv`, mismo formato que `devaluacion_mensual.csv`:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Mes | `2008-02` | Mes calendario, `YYYY-MM` |
| 2 | Devaluación | `0.3144654088` | Variación del mes, en **porcentaje**, 10 decimales |

```
2008-02;0.3144654088
2008-03;0.0000000000
...
2026-07;3.8016528925
```

Son **222 filas**, de `2008-02` a `2026-07`, sin huecos. Se omiten dos meses, por los mismos
motivos que en el pipeline oficial:

```
OK: 222 filas escritas en devaluacion_mensual_blue.csv
  omitido: 2008-01 (falta el cierre de 2007-12)
  omitido: 2026-08 (mes sin cerrar, ultimo dato 21)
```

## Validación

- Recalculé los 222 meses de forma independiente en punto flotante, contra los cierres de
  `cotizacion_blue.csv`: la diferencia máxima es **menor a 1e-10**, que es justo el corte de
  los 10 decimales.
- Contra el oficial, la divergencia media es de **4,6 pp**, y el mes que más se separa es
  `2023-12`: el blue subió 8,3 % y el oficial 124,3 %. Es el salto cambiario de diciembre de
  2023, cuando el oficial alcanzó al paralelo en vez de al revés — el orden de magnitud y la
  dirección son los correctos.
- Los extremos de la serie son `2020-04` (**+43,1 %**) y `2024-02` (**−12,2 %**).

---

# Archivos

| Archivo | Descripción |
|---|---|
| `ipc.csv` | Origen de inflación, descargado de datos.gob.ar (no se modifica) |
| `EvolucionMoneda.csv` | Origen de tipo de cambio, descargado del BCRA (no se modifica) |
| `dolarblue.csv` | Origen de dólar blue, volcado de página (no se modifica) |
| `process_ipc.js` | Transforma `ipc.csv` → `ipc_processed.csv` |
| `process_tipo_de_cambio.js` | Transforma `EvolucionMoneda.csv` → `tipo_de_cambio.csv` |
| `process_devaluacion.js` | Transforma `tipo_de_cambio.csv` → `devaluacion_mensual.csv`; exporta `procesar()` |
| `process_cotizacion_blue.js` | Transforma `dolarblue.csv` → `cotizacion_blue.csv` |
| `process_devaluacion_blue.js` | Transforma `cotizacion_blue.csv` → `devaluacion_mensual_blue.csv` |
| `tipo_de_cambio.csv` | Intermedio: cotización oficial diaria normalizada (generado) |
| `cotizacion_blue.csv` | Intermedio y salida: cotización diaria del blue (generado) |
| `ipc_processed.csv` | Salida: inflación mensual |
| `devaluacion_mensual.csv` | Salida: devaluación mensual del oficial |
| `devaluacion_mensual_blue.csv` | Salida: devaluación mensual del blue |
| `inflacionmensual.csv` | Serie de inflación del BCRA, usada para validar la salida de IPC |

## Actualizar los datos

1. Volver a bajar `ipc.csv`, `EvolucionMoneda.csv` y/o `dolarblue.csv` de los orígenes de arriba.
2. Correr los scripts de ese origen, en orden. Para el oficial:
   `node process_tipo_de_cambio.js` y después `node process_devaluacion.js`. Para el blue:
   `node process_cotizacion_blue.js` y después `node process_devaluacion_blue.js`.
3. Revisar los avisos de consola: si aparece un `omitido:` inesperado, el origen tiene un
   hueco o un mes sin cerrar.
