/**
 * Prepara el portátil 3D de «En tu negocio» (web/public/modelos/macbook.glb)
 * a partir del modelo original de Sketchfab:
 *
 *   «macbook pro M3 16 inch 2024», de jackbaeten
 *   https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4
 *   Licencia CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): el
 *   crédito va en la propia sección (ver en-tu-negocio.tsx).
 *
 * Cambios sobre el original (los que la licencia pide indicar):
 * - Sin el logo de la tapa: la marca del portátil no es la protagonista.
 * - Sin las piezas invisibles (material BLEND con alfa 0).
 * - Pantalla apagada (cristal negro, sin el fondo de 2048×1024): encima se
 *   proyecta el panel en HTML.
 * - Dos piezas, `Base` y `Tapa`. La tapa queda vertical con el origen en el
 *   eje de la bisagra, para que la escena la abra girándola en X (en el
 *   original viene abierta 110°). Todo sube lo justo para apoyar en y = 0.
 * - Piezas unidas por material, texturas a WebP de 512 px como mucho y
 *   geometría comprimida con meshopt (EXT_meshopt_compression).
 *
 * Uso, desde web/ (las dependencias no se guardan en package.json):
 *   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 \
 *     @gltf-transform/functions@4 meshoptimizer sharp
 *   node scripts/preparar-macbook.mjs <original.glb> public/modelos/macbook.glb
 */
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  join,
  meshopt,
  prune,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error(
    "Uso: node scripts/preparar-macbook.mjs <original.glb> <salida.glb>"
  );
  process.exit(1);
}

/** Nombres de nodo del .glb de Sketchfab (los genera su exportador). */
const NODO_BASE = "BoBvWqDHZjAeVrp_44";
const NODO_TAPA = "VCQqxpxkUlzqcJI_62";
const NODO_LOGO = "Object_125";
const NODO_PANTALLA = "Object_123";
/** Eje de la bisagra (el cilindro de la tapa, Object_101), en cm. */
const BISAGRA_Y = 0.37;
const BISAGRA_Z = -12.82;

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(entrada);
const raiz = doc.getRoot();
const escena = raiz.listScenes()[0];

function nodo(nombre) {
  const n = raiz.listNodes().find((x) => x.getName() === nombre);
  if (!n) throw new Error(`No está el nodo ${nombre}`);
  return n;
}

/* Matrices 4x4 en columnas (como glTF). */
function multiplica(a, b) {
  const c = new Array(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let fil = 0; fil < 4; fil++)
      for (let k = 0; k < 4; k++)
        c[col * 4 + fil] += a[k * 4 + fil] * b[col * 4 + k];
  return c;
}
// prettier-ignore
const traslacion = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
function giroX(rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // prettier-ignore
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

// Ángulo de la tapa: el plano de la pantalla respecto a la vertical.
const cajaPantalla = getBounds(nodo(NODO_PANTALLA));
const inclinacion = Math.atan2(
  cajaPantalla.max[2] - cajaPantalla.min[2],
  cajaPantalla.max[1] - cajaPantalla.min[1]
);
const subir = -getBounds(escena).min[1];

// 1. Fuera el logo y las piezas invisibles.
nodo(NODO_LOGO).dispose();
for (const n of raiz.listNodes()) {
  const malla = n.getMesh();
  if (!malla) continue;
  const invisible = malla.listPrimitives().every((p) => {
    const m = p.getMaterial();
    return m && m.getAlphaMode() === "BLEND" && m.getAlpha() === 0;
  });
  if (invisible) n.dispose();
}

// 2. Pantalla apagada: cristal negro.
const pantalla = nodo(NODO_PANTALLA);
for (const p of pantalla.getMesh().listPrimitives()) {
  p.getMaterial()
    .setEmissiveTexture(null)
    .setEmissiveFactor([0, 0, 0])
    .setBaseColorFactor([0.01, 0.01, 0.012, 1])
    .setMetallicFactor(0.2)
    .setRoughnessFactor(0.12)
    .setExtension("KHR_materials_emissive_strength", null);
}

// 3. Base y Tapa, con las transformaciones del mundo horneadas en cada hoja.
function hojas(grupo) {
  const lista = [];
  grupo.traverse((n) => n.getMesh() && lista.push(n));
  return lista.map((n) => ({ n, mundo: n.getWorldMatrix() }));
}
const hojasBase = hojas(nodo(NODO_BASE));
const hojasTapa = hojas(nodo(NODO_TAPA));
const base = doc.createNode("Base").setTranslation([0, subir, 0]);
const tapa = doc
  .createNode("Tapa")
  .setTranslation([0, BISAGRA_Y + subir, BISAGRA_Z]);
const aVertical = multiplica(
  giroX(inclinacion),
  traslacion(0, -BISAGRA_Y, -BISAGRA_Z)
);
for (const { n, mundo } of hojasBase) {
  n.getParentNode()?.removeChild(n);
  base.addChild(n.setMatrix(mundo));
}
for (const { n, mundo } of hojasTapa) {
  n.getParentNode()?.removeChild(n);
  tapa.addChild(n.setMatrix(multiplica(aVertical, mundo)));
}
for (const hijo of escena.listChildren()) hijo.dispose();
escena.addChild(base).addChild(tapa);

// Solo la pantalla conserva el nombre: `join` une todo lo demás por material.
for (const n of raiz.listNodes()) if (n !== base && n !== tapa) n.setName("");
for (const m of raiz.listMeshes()) m.setName("");
pantalla.setName("Pantalla");
pantalla.getMesh().setName("Pantalla");

await doc.transform(
  prune(),
  dedup(),
  weld(),
  join({ keepNamed: true }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512] }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  prune()
);

doc.getRoot().getAsset().extras = {
  titulo: "macbook pro M3 16 inch 2024",
  autor: "jackbaeten (https://sketchfab.com/jackbaeten)",
  licencia: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
  origen:
    "https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4",
  cambios:
    "Sin logo en la tapa, sin piezas invisibles, pantalla apagada, tapa vertical con pivote en la bisagra, texturas WebP y geometría meshopt.",
};
await io.write(salida, doc);
console.log(
  `Tapa inclinada ${((inclinacion * 180) / Math.PI).toFixed(2)}° en el original; subida ${subir.toFixed(3)} cm.`
);
