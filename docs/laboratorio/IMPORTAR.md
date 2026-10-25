# Importar un componente desde una foto o una hoja de datos

La persona sube la foto de un módulo Arduino o su hoja de datos (PDF). Qubi (Claude, visión, en el servidor) lee la
**ficha**; la persona la revisa y la corrige; un validador determinista la comprueba; se genera un modelo 3D
paramétrico (con la foto como textura de la cara de arriba) y se guarda en **Mi catálogo**. De ahí se arrastra al
banco, se cablea (el verificador y la guía entienden sus pines), se simula (genérico: con energía / sin energía),
tiene caja (usa sus medidas) y código (un comentario marcado para lo que no sabemos).

## Piezas

| Capa | Archivo | Qué hace |
|---|---|---|
| Model | `src/models/lab/componentSpec.ts` | `ComponentSpec`, `validateSpec`, `specToComponent`, `userEntryFor`, `parseSpec`, `slugId`. Puro. |
| Model | `src/models/lab/catalog.ts` | Registro de piezas del usuario: `registerUserComponents`, `userEntryOf`, `isUserComponent`. `COMPONENTS` no cambia; `componentOf` y `catalogSections` ven las dos listas. |
| Model | `guide.ts`, `simulation.ts`, `sketch.ts` | `pinRole` usa el rol que puso la persona; la simulación da `{ kind: "generic", on }`; el sketch escribe los pines y un comentario "pieza importada". `enclosure.ts` ya usa solo `size`. |
| Route | `src/app/api/component/extract/route.ts` | `POST` multipart `{ file, hint? }` o JSON `{ fileBase64, mime, hint? }`. Imágenes o PDF, hasta 10 MB, con comprobación de los primeros bytes. Salida estructurada (`output_config.format` con JSON schema). Sin clave: `503 { error: "no-key" }`. Nunca registra el archivo ni la clave. |
| Service | `src/services/userCatalog.ts` | localStorage (fichas + foto ≤ 512 px, con guardas de tamaño), `.json` de la ficha, `extractComponent`. |
| 3D | `src/views/scene/lab/parts/custom.ts` | `customBuilder(photoUrl?)`: placa con la foto arriba, pines en `pinSpots`, cuerpo genérico según la categoría y una luz verde para "tiene energía". `buildPart(type, photoUrl?)` lo usa para tipos de usuario. |
| ViewModel | `src/viewmodels/useImportViewModel.ts` (+ `importForm.ts`) | Estado del diálogo, validación en vivo, vista previa registrada, guardar / quitar / exportar. Registra Mi catálogo al cargar el módulo en el navegador. |
| View | `src/views/components/lab/ImportComponent.tsx`, `src/views/scene/lab/PartPreview.tsx`, `CatalogPanel.tsx` | Diálogo de vidrio, vista previa 3D, botón "Nuevo componente" y sección "Mi catálogo". Textos en `src/views/copy/import.ts`. |

## Cómo montarlo (WorkspaceScreen)

```tsx
import { useImportViewModel } from "@/viewmodels/useImportViewModel";
import { ImportComponent } from "@/views/components/lab/ImportComponent";
// ...
const imp = useImportViewModel();
// ...
<CatalogPanel vm={lab} mine={imp} />   // sin `mine` el catálogo funciona igual, sin botón ni sección
<ImportComponent vm={imp} />           // en cualquier parte del stage
```

## Reglas del validador (rojo bloquea, amarillo avisa)

Medidas 1 a 300 mm; ids `usr-…` y distintos de los del laboratorio; pines con nombre válido y sin repetir; roles
conocidos; una pieza necesita un pin de tierra; un pin de alimentación pide voltios (y al revés, aviso); una placa
pide nivel lógico (3,3 o 5 V) y tierra; sin licencia, o con licencia no comercial (CC BY-NC…), es un aviso amarillo
"solo uso personal". Los textos están en `importCopy.check.issues`.

## Huecos conocidos

- Las piezas importadas no están en el catálogo del agente del chat (`lab_catalog` lee `COMPONENTS`).
- Un PDF no da foto: el modelo usa un color liso.
- El comportamiento en la simulación es genérico y el sketch deja un comentario; no se genera código por pieza.
- Las medidas de una foto son un cálculo (la ficha lo dice); no hay recorte ni giro manual de la foto.
- Un banco guardado con una pieza importada la pierde si se quita esa pieza de Mi catálogo (como cualquier tipo desconocido).
