# ipc_csv_processor

Transforma el CSV de IPC publicado por el INDEC / datos.gob.ar a un formato reducido y
listo para ser consumido por otro programa.

## Fuente de los datos

`ipc.csv` se descarga de:

<https://infra.datos.gob.ar/catalog/sspm/dataset/145/distribution/145.3/download/indice-precios-al-consumidor-nivel-general-base-diciembre-2016-mensual.csv>

Es el **Índice de Precios al Consumidor, nivel general, base diciembre 2016, frecuencia
mensual**. Trae 22 columnas: el índice y sus tasas de variación (mensual, y acumulada
desde diciembre del año anterior) para el total nacional y para cada región — GBA,
Pampeana, NEA, NOA, Cuyo y Patagonia.

De todo eso, a nosotros nos interesan solo dos columnas.

## Uso

```bash
node process_ipc.js
```

Lee `ipc.csv` y escribe `ipc_processed.csv` en el mismo directorio. Se le pueden pasar
rutas distintas:

```bash
node process_ipc.js entrada.csv salida.csv
```

## Qué contiene el formato de salida

`ipc_processed.csv` es un CSV **sin encabezado**, separado por `;`, con dos campos:

| # | Campo | Ejemplo | Descripción |
|---|-------|---------|-------------|
| 1 | Fecha | `30/06/2017` | Último día del mes, formato `DD/MM/AAAA` |
| 2 | Variación mensual | `1.1920734714` | Inflación del mes, en **porcentaje** |

```
30/06/2017;1.1920734714
31/07/2017;1.7322662871
...
31/07/2026;2.1137724268
```

Transformaciones aplicadas sobre el origen:

- Se toman únicamente `indice_tiempo` y `ipc_ng_nacional_tasa_variacion_mensual`.
- El separador pasa de `,` a `;`.
- Se elimina la fila de encabezado.
- El valor se multiplica por 100: el origen trae la tasa en fracción (`0.011920…`) y la
  salida la expresa en porcentaje (`1.1920…`). El resultado se recorta a 10 decimales
  porque multiplicar por 100 en punto flotante binario arrastra ruido
  (`0.015859 * 100` da `1.5858999999999845`).
- La fecha pasa del día 1 al último día del mes.
- Se descartan los meses anteriores a junio de 2017.

## Por qué la fecha es el último día del mes

El origen fecha cada registro con el **día 1 del mes** (`2017-06-01`). Eso es una
convención de etiquetado: marca a qué mes pertenece el dato, no cuándo ocurrió.

Pero el valor de la columna no es la inflación del día 1: es la **inflación acumulada a lo
largo de todo el mes**, medida contra el mes anterior. Es un dato que recién queda completo
cuando el mes terminó. Fecharlo el día 1 hace que cualquier programa que lo consuma —un
gráfico, un cálculo de acumulados, un join contra otra serie— ubique el valor al principio
de un período que todavía no había transcurrido.

Por eso movemos la fecha al último día del mismo mes: `2017-06-01` → `30/06/2017`. Así la
fecha coincide con el momento en que el acumulado del mes está efectivamente cerrado.

El último día se calcula con `new Date(Date.UTC(year, month, 0))` — el día 0 del mes
siguiente es el último del mes actual, lo que hace que JavaScript resuelva solo los meses
de 31, 30 y 28 días, **incluidos los bisiestos**: `29/02/2020` y `29/02/2024` salen
correctos sin ninguna regla especial.

## Por qué la serie arranca en junio de 2017

El origen empieza en diciembre de 2016, pero la salida descarta todo lo anterior a
**junio de 2017**. Hay dos motivos, uno menor y uno importante.

**El mes base no tiene dato.** Diciembre de 2016 es el mes base del índice (valor 100). Al
ser el punto de partida no tiene mes anterior contra el cual comparar, así que su celda de
variación mensual viene **vacía**. Una fila con fecha pero sin valor obliga a todo
consumidor del archivo a manejar un caso especial, y no aporta nada.

**El IPC nacional no es comparable antes de junio de 2017.** Este es el motivo de fondo.
El IPC **nacional** del INDEC recién alcanza cobertura completa hacia mediados de 2017.
Antes de eso, lo habitual en otras publicaciones de inflación era informar la serie de
**GBA**, que es una medición distinta. El resultado es que entre enero y mayo de 2017 esta
columna y otras fuentes discrepan de forma apreciable, porque no están midiendo lo mismo:

| Mes | Nacional | GBA | BCRA (`inflacionmensual.csv`) |
|---|---|---|---|
| 01/2017 | 1,59 | 1,31 | 1,3 ← sigue a GBA |
| 02/2017 | 2,07 | 2,46 | 2,5 ← sigue a GBA |
| 05/2017 | 1,43 | 1,28 | 1,3 ← sigue a GBA |
| 06/2017 | 1,19 | 1,39 | 1,2 ← sigue a nacional |

A partir de junio de 2017 las otras fuentes pasan a seguir la serie nacional y las
diferencias desaparecen. Como el archivo de salida está pensado para que otro programa lo
cruce contra datos de inflación, arrastrar cinco meses que responden a una medición
distinta sería una fuente silenciosa de error. Se cortan.

Si en algún momento hiciera falta la serie completa desde enero de 2017, alcanza con
cambiar la constante `START_MONTH` en `process_ipc.js`, teniendo presente la salvedad de
arriba.

## Validación

La salida se contrastó mes a mes contra `inflacionmensual.csv`, que es una serie de una
**fuente distinta**: el BCRA (Banco Central de la República Argentina), publicada en su
sección de principales variables como *Inflación mensual (variación en %)*, serie 7931:

<https://www.bcra.gob.ar/principales-variables-datos/?serie=7931&detalle=Inflaci%C3%B3n+mensual+%28variaci%C3%B3n+en+%25%29>

Viene en formato `DD/MM/AAAA;valor`, sin encabezado, ya expresada en porcentaje y
**redondeada a un decimal**. Sirve como control cruzado independiente: si la
transformación de este proyecto tuviera un error de escala, de corrimiento de mes o de
columna, el contraste contra el BCRA lo delataría.

Sobre los **110 meses** de 06/2017 a 07/2026:

- Diferencia absoluta **máxima: 0,05 pp**; media 0,025 pp.
- Sesgo medio: +0,0035 pp — ninguna de las dos series corre sistemáticamente por encima de
  la otra.
- El 100 % de los meses coincide al redondear a un decimal.

Esa diferencia residual de ~0,03 pp es puro **redondeo**: el BCRA publica con un decimal y
esta salida conserva diez. No hay discrepancia de datos — ambas series reflejan el mismo
IPC del INDEC, solo que con distinta precisión.

## Archivos

| Archivo | Descripción |
|---|---|
| `ipc.csv` | Origen, descargado de datos.gob.ar (no se modifica) |
| `process_ipc.js` | El script de transformación |
| `ipc_processed.csv` | Salida generada |
| `inflacionmensual.csv` | Serie de inflación mensual del BCRA, usada para validar la salida |
