# ipc_csv_processor

Toma datos oficiales de **inflación** (INDEC vía datos.gob.ar) y de **tipo de cambio**
(BCRA), y los convierte en dos CSV chicos, con el mismo formato y el mismo eje temporal,
para que otro programa los consuma y los pueda cruzar directamente.

| Pipeline | Origen | Script | Salida |
|---|---|---|---|
| Inflación mensual | `ipc.csv` | `process_ipc.js` | `ipc_processed.csv` |
| Devaluación mensual | `tipo_de_cambio.csv` | `process_devaluacion.js` | `devaluacion_mensual.csv` |

Ambas salidas comparten el mismo contrato: **sin encabezado**, separadas por `;`, fecha en
`DD/MM/AAAA` correspondiente al **último día del mes**, y valor en **porcentaje** con `.`
como separador decimal. Hoy las dos cubren exactamente los mismos **110 meses**, de
`30/06/2017` a `31/07/2026`.

## Uso

```bash
node process_ipc.js
```

```bash
node process_devaluacion.js
```

Cada script lee su origen y escribe su salida en el mismo directorio. Los dos aceptan
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
fecha coincide con el momento en que el acumulado del mes está efectivamente cerrado. El
mismo criterio se aplica en el pipeline de devaluación, y es lo que permite cruzar los dos
archivos sin corrimientos.

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

# 2. Devaluación mensual

## Fuente

`tipo_de_cambio.csv` se obtiene del BCRA, en *Evolución de una moneda*:

<https://www.bcra.gob.ar/evolucion-moneda>

Recorrido: **Dólar estadounidense → Mercado de cambios, cotizaciones cierre vendedor**.

Es una serie **diaria** de días hábiles, en formato `DD/MM/AAAA;cotización`, sin encabezado
y con seis decimales:

```
31/05/2017;16.100000
01/06/2017;16.060000
02/06/2017;16.000000
```

## Formato de salida

`devaluacion_mensual.csv`:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Fecha | `30/06/2017` | Último día del mes, `DD/MM/AAAA` |
| 2 | Devaluación | `3.2919254658` | Variación del mes, en **porcentaje**, 10 decimales |

```
30/06/2017;3.2919254658
31/07/2017;6.0733613950
31/08/2017;-1.8707482993
30/09/2017;0.0000000000
...
31/07/2026;0.2024291497
```

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
con la última fecha presente. La fila, en cambio, se emite fechada el **último día
calendario** (`30/09/2017`), que es el mismo criterio del pipeline de inflación — así los
dos archivos alinean sin corrimientos.

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
quedan, el mes no está cerrado y se omite: una devaluación parcial fechada a fin de mes sería
un dato falso. Hoy el origen llega al `14/08/2026`, así que agosto de 2026 queda afuera.

Todo mes omitido se informa por consola con su motivo, para que ninguna fila desaparezca en
silencio:

```
OK: 110 filas escritas en devaluacion_mensual.csv
  omitido: 2026-08 (mes sin cerrar, ultimo dato 14)
```

---

# Archivos

| Archivo | Descripción |
|---|---|
| `ipc.csv` | Origen de inflación, descargado de datos.gob.ar (no se modifica) |
| `tipo_de_cambio.csv` | Origen de tipo de cambio, descargado del BCRA (no se modifica) |
| `process_ipc.js` | Transforma `ipc.csv` → `ipc_processed.csv` |
| `process_devaluacion.js` | Transforma `tipo_de_cambio.csv` → `devaluacion_mensual.csv` |
| `ipc_processed.csv` | Salida: inflación mensual |
| `devaluacion_mensual.csv` | Salida: devaluación mensual |
| `inflacionmensual.csv` | Serie de inflación del BCRA, usada para validar la salida de IPC |

## Actualizar los datos

1. Volver a descargar `ipc.csv` y/o `tipo_de_cambio.csv` de los links de arriba.
2. Correr el script correspondiente.
3. Revisar los avisos de consola: si aparece un `omitido:` inesperado, el origen tiene un
   hueco o un mes sin cerrar.
