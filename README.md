# Velitas 1.0.0

App web instalable para llevar los pedidos y costos de un taller de velas. En español, sin registro, sin servidor de datos y sin dependencias de ejecución.

**Abrir la app:** https://javifex.github.io/velitas/

## Uso en iPhone

1. Abre la dirección HTTPS publicada en Safari.
2. Usa Compartir → Agregar a pantalla de inicio (activa «Abrir como app web» si aparece).
3. Abre el icono Velitas con internet la primera vez. El caché permite volver a abrir y usar la app sin conexión.
4. Crea los pedidos desde el icono instalado. El navegador y la app instalada pueden tener almacenamiento separado.
5. En el icono del escudo, exporta un respaldo JSON y guárdalo en Archivos o Drive periódicamente. Allí puedes restaurarlo en otro dispositivo, tras revisar y confirmar el reemplazo.

Cada dispositivo mantiene sus propios pedidos. El enlace permite acceder a la app sin cuenta, pero no da acceso a los pedidos de otra persona. No se transmiten clientes, costos ni notas. No hay sincronización ni copia automática en la nube. Evita el modo privado para guardar pedidos. Cambiar de dirección web no traslada los datos: exporta un respaldo antes.

## Funciones

- Crear y buscar pedidos por cliente, incluyendo nombres con tildes.
- Filtrar y cambiar entre Cotizando, Ejecutando y Completado.
- Editar descripción, cantidad, venta total, fecha de entrega y notas.
- Añadir, editar y eliminar costos, con confirmación antes de borrar.
- Ganancia = precio de venta total − suma de costos registrados. El margen usa el precio de venta como denominador.
- Calcular cera por gramos por vela × cantidad ÷ 1.000 × costo del kilo. Transportes, colorante, aromatizante, pabilo y moldes son importes del lote completo. Para un molde reutilizable, introduce el costo de uso que asignas a ese lote.
- Crear un pedido a partir de la cotización. Cambiar su cantidad después no recalcula los costos ni el precio; se conserva lo registrado y se informa en el formulario.
- Empaques, mano de obra y otros costos se pueden agregar al pedido.
- Respaldo/restauración con validación, sin reemplazo silencioso de datos dañados.

Los valores están en pesos colombianos, con hasta dos decimales y sin separadores de miles al escribir. Se admite coma o punto decimal. Se guardan centavos enteros y la cera del lote se redondea una sola vez. El costo por vela mostrado se redondea a un centavo. No es contabilidad tributaria ni facturación electrónica.

## Desarrollo

Requiere Node.js 22 o posterior. Sin instalación de paquetes.

```sh
npm run check
npm start
```

Abre http://localhost:4173. El servidor local solo escucha en este equipo. Para usar el modo sin conexión en el teléfono se requiere la dirección HTTPS publicada, no un archivo HTML abierto desde Archivos. Publica el contenido de `dist/` en un servidor estático HTTPS que sirva `.js`, `.webmanifest`, imágenes y `sw.js` correctamente. El service worker usa un caché versionado: al actualizar recursos, incrementa la versión en package.json, app.js, index.html y sw.js.

## Publicación en GitHub Pages

El repositorio público es https://github.com/Javifex/velitas. GitHub Pages publica el contenido de `dist/` mediante `.github/workflows/pages.yml`. Cada actualización de `main` ejecuta las pruebas y solo publica si pasan. También se puede ejecutar el flujo desde la pestaña Actions. No requiere secretos ni instalar dependencias.

En Settings → Pages, la fuente debe ser **GitHub Actions**. La app usa rutas relativas y funciona bajo `/velitas/`, incluyendo el icono instalado y el modo sin conexión. No se publican respaldos ni pedidos personales: estos se guardan únicamente en el dispositivo.

Si ya usaste la dirección anterior de Velitas, exporta un respaldo allí y restáuralo en la dirección de GitHub antes de continuar. Cambiar la dirección no traslada automáticamente los pedidos. Instala el nuevo enlace desde Safari y comprueba el respaldo desde ese icono antes de retirar el anterior.

GitHub Pages está disponible gratis para repositorios públicos. Esta edición personal no procesa cobros ni ofrece un servicio comercial. Antes de ofrecer la app como SaaS de pago, debe trasladarse a un alojamiento que permita ese uso: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits.

## Base para una edición comercial

`dist/domain.js` contiene cálculos y validación independientes de la interfaz. `dist/storage.js` concentra persistencia y respaldos; `dist/app.js` contiene la interfaz. Una edición comercial requiere implementar cuentas, aislamiento entre negocios, sincronización y recuperación segura antes de alojar datos de usuarios. La publicación en App Store requiere una versión iOS, firma y revisión de Apple; este paquete es una PWA, no un IPA.

## Límites y privacidad

Los datos están en el almacenamiento local del origen web. Borrar ese almacenamiento o perder el dispositivo puede perder pedidos si no hay respaldo. La app no agrega analítica, publicidad, fuentes externas ni servicios de terceros. La infraestructura de alojamiento puede registrar visitas técnicas. Quien tenga el dispositivo desbloqueado puede ver sus pedidos y los respaldos contienen los datos de clientes en texto legible.

Límites de validación: 100.000 velas por pedido, 500 conceptos por pedido, 10.000 pedidos y respaldo importado de hasta 5 MiB. La capacidad real de guardado depende del navegador; si se llena, se muestra el error y se conserva el estado previo. No se ha probado en un iPhone físico desde este equipo Windows.
