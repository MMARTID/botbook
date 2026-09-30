import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Texture,
  type Material,
  type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * El portátil 3D de la portada, compartido por «En tu negocio»
 * (`en-tu-negocio-escena.ts`) y la simulación del Gestor
 * (`gestor-mac-escena.ts`): el modelo, su crédito, la iluminación de estudio
 * con la que se diseñó, la sombra de contacto y la homografía que proyecta
 * una pantalla HTML sobre la tapa. Cada escena pone su cámara, su progreso y
 * su pantalla; lo que hay aquí es lo que tiene que verse igual en las dos.
 *
 * El modelo (`public/modelos/macbook.glb`, «macbook pro M3 16 inch 2024» de
 * jackbaeten, CC BY 4.0: el crédito en la página es obligatorio) está
 * preparado con `scripts/preparar-macbook.mjs`: sin logo, con la tapa
 * vertical y el pivote en la bisagra. Medidas en cm.
 */

export const MODELO = {
  titulo: "macbook pro M3 16 inch 2024",
  origen:
    "https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4",
  autor: "https://sketchfab.com/jackbaeten",
  licencia: "https://creativecommons.org/licenses/by/4.0/",
} as const;

export const RUTA_MODELO = "/modelos/macbook.glb";

/**
 * El diseño se hizo con three.js 0.149, que leía los colores hexadecimales
 * como lineales y usaba intensidades de luz «legacy». Con la gestión de color
 * actual el mismo portátil salía casi negro en vez de gris espacial: para que
 * se vea como en Claude Design, los colores se leen como lineales y las luces
 * se multiplican por π (la equivalencia que da three desde r155).
 */
export const lineal = (hex: number) =>
  new Color().setHex(hex, LinearSRGBColorSpace);
export const LUZ_LEGACY = Math.PI;

export const acotar = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, v));
/** Posición de `v` dentro del tramo [a, b], acotada a [0, 1]. */
export const tramo = (v: number, a: number, b: number) =>
  acotar((v - a) / (b - a));
/** Ease-in-out cúbico. */
export const suave = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Interpola entre fotogramas clave con `suave` en cada tramo. */
export function claves(
  v: number,
  xs: readonly number[],
  ys: readonly number[]
) {
  if (v <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]) {
      const t = suave((v - xs[i - 1]) / (xs[i] - xs[i - 1]));
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[ys.length - 1];
}

/* ── Homografía: la pantalla HTML sobre las 4 esquinas proyectadas ──
   Matrices 3x3 en filas, como arrays de 9. */
type Matriz = number[];

function adjunta(m: Matriz): Matriz {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}

function multiplica(a: Matriz, b: Matriz): Matriz {
  const c: Matriz = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = s;
    }
  }
  return c;
}

function aplica(m: Matriz, v: number[]) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Matriz que lleva la base canónica a los 4 puntos `p` (x0,y0,…,x3,y3). */
function baseAPuntos(p: number[]): Matriz {
  const m = [p[0], p[2], p[4], p[1], p[3], p[5], 1, 1, 1];
  const v = aplica(adjunta(m), [p[6], p[7], 1]);
  return multiplica(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** `matrix3d` CSS que lleva las esquinas `origen` a `destino`. */
export function homografia(origen: number[], destino: number[]) {
  const t = multiplica(baseAPuntos(destino), adjunta(baseAPuntos(origen)));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}

/** Las cuatro esquinas de una pantalla HTML de `ancho` × `alto` px, en el
 * orden que espera `homografia` (arriba-izquierda, arriba-derecha,
 * abajo-izquierda, abajo-derecha). */
export function esquinasHtml(ancho: number, alto: number): number[] {
  return [0, 0, ancho, 0, 0, alto, ancho, alto];
}

/** Libera geometrías, materiales y texturas de una escena. */
export function liberar(escena: Object3D) {
  escena.traverse((objeto) => {
    if (!(objeto instanceof Mesh)) return;
    objeto.geometry.dispose();
    const materiales: Material[] = Array.isArray(objeto.material)
      ? objeto.material
      : [objeto.material];
    for (const material of materiales) {
      for (const valor of Object.values(material)) {
        if (valor instanceof Texture) valor.dispose();
      }
      material.dispose();
    }
  });
}

/**
 * Luz de estudio: un entorno de paneles luminosos (para los reflejos del
 * aluminio) más una hemisférica y un sol. Devuelve la limpieza.
 */
export function iluminar(renderer: WebGLRenderer, escena: Scene): () => void {
  const pmrem = new PMREMGenerator(renderer);
  const estudio = new Scene();
  estudio.background = lineal(0x6b6b70);
  const panelDeLuz = (
    w: number,
    h: number,
    color: number,
    posicion: [number, number, number],
    giro: [number, number, number]
  ) => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: lineal(color), side: DoubleSide })
    );
    m.position.set(...posicion);
    m.rotation.set(...giro);
    estudio.add(m);
  };
  panelDeLuz(60, 60, 0xffffff, [0, 40, 0], [Math.PI / 2, 0, 0]);
  panelDeLuz(30, 50, 0xd8d8ff, [-45, 10, 10], [0, Math.PI / 2, 0]);
  panelDeLuz(30, 50, 0xffffff, [45, 15, -10], [0, -Math.PI / 2, 0]);
  panelDeLuz(80, 20, 0x3a3a3f, [0, -10, 0], [-Math.PI / 2, 0, 0]);
  const entorno = pmrem.fromScene(estudio, 0.04);
  escena.environment = entorno.texture;
  escena.add(
    new HemisphereLight(0xffffff, lineal(0x444444), 0.5 * LUZ_LEGACY)
  );
  const sol = new DirectionalLight(0xffffff, 1.1 * LUZ_LEGACY);
  sol.position.set(10, 30, 20);
  escena.add(sol);
  return () => {
    liberar(estudio);
    entorno.dispose();
    pmrem.dispose();
  };
}

export interface Portatil {
  /** El modelo entero, para añadirlo a la escena. */
  modelo: Object3D;
  /** La tapa, con el pivote en la bisagra: `rotation.x` la abre y la cierra. */
  tapa: Object3D;
  /** Un punto en el centro de la pantalla, hijo de la tapa, sobre el que se
   * proyecta el HTML. */
  pantalla: Object3D;
  /** Las esquinas de la pantalla en el espacio de `pantalla` (x, y), en el
   * orden de `esquinasHtml`. */
  esquinas: [number, number][];
  /** Alto de la pantalla en cm, con la proporción pedida. */
  altoPantalla: number;
}

/**
 * Descarga el portátil y localiza su pantalla. La tapa llega vertical y sin
 * girar: la caja del cristal en el mundo, pasada al espacio de la tapa, es el
 * rectángulo de la pantalla. Caja precisa (vértice a vértice): la geometría
 * del cristal viene inclinada en su propio espacio, y la caja rápida la
 * engordaba varios cm. La pantalla HTML se ajusta al ancho del cristal con la
 * proporción `anchoHtml / altoHtml`.
 */
export async function cargarPortatil(
  anchoHtml: number,
  altoHtml: number
): Promise<Portatil> {
  const gltf = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(RUTA_MODELO);
  const tapa = gltf.scene.getObjectByName("Tapa");
  const cristal = gltf.scene.getObjectByName("Pantalla");
  if (!tapa || !cristal) {
    liberar(gltf.scene);
    throw new Error("[Portátil3D] Al modelo le faltan Tapa y Pantalla");
  }
  gltf.scene.updateMatrixWorld(true);
  const caja = new Box3().setFromObject(cristal, true);
  tapa.worldToLocal(caja.min);
  tapa.worldToLocal(caja.max);
  const ancho = caja.max.x - caja.min.x;
  const altoPantalla = (ancho * altoHtml) / anchoHtml;
  const esquinas: [number, number][] = [
    [-ancho / 2, altoPantalla / 2],
    [ancho / 2, altoPantalla / 2],
    [-ancho / 2, -altoPantalla / 2],
    [ancho / 2, -altoPantalla / 2],
  ];
  const pantalla = new Object3D();
  pantalla.position.set(
    (caja.min.x + caja.max.x) / 2,
    (caja.min.y + caja.max.y) / 2,
    caja.max.z + 0.02
  );
  tapa.add(pantalla);
  return { modelo: gltf.scene, tapa, pantalla, esquinas, altoPantalla };
}

/** Sombra de contacto: un degradado radial pintado en canvas, tumbado bajo el
 * portátil. Empieza oculta; cada escena la enseña cuando llega el modelo. */
export function crearSombra(): Mesh {
  const lienzoSombra = document.createElement("canvas");
  lienzoSombra.width = 256;
  lienzoSombra.height = 256;
  const ctx = lienzoSombra.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(10,10,10,.34)");
    g.addColorStop(0.55, "rgba(10,10,10,.12)");
    g.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const sombra = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      map: new CanvasTexture(lienzoSombra),
      transparent: true,
      depthWrite: false,
    })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = -0.05;
  sombra.scale.set(58, 40, 1);
  sombra.visible = false;
  return sombra;
}
