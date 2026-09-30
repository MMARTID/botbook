import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LinearSRGBColorSpace,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * Motor de «En tu negocio» (`en-tu-negocio.tsx`). Recibe la <section> ya
 * pintada por React y le da vida: el progreso del scroll abre la tapa del
 * portátil, mueve la cámara, cambia la pantalla y va enseñando los textos.
 * Devuelve la limpieza.
 *
 * El portátil es un modelo 3D (`public/modelos/macbook.glb`, «macbook pro M3
 * 16 inch 2024» de jackbaeten, CC BY 4.0: el crédito de la sección es
 * obligatorio), preparado con `scripts/preparar-macbook.mjs`: sin logo, con la
 * tapa vertical y el pivote en la bisagra. Lo que se ve en su pantalla es
 * HTML normal (el `.mx` de la sección), proyectado sobre la tapa con una
 * homografía (`matrix3d`) que lleva sus cuatro esquinas a las de la pantalla
 * 3D. Así el texto sigue nítido y la pantalla es la de la app de verdad.
 *
 * Mismas reglas que «En tu bolsillo» (`llamada-scroll.tsx`): la presencia de
 * cada paso cambia de golpe en las costuras (1/3 y 2/3) sobre el progreso
 * crudo, y todo lo demás va sobre un progreso suavizado.
 *
 * El componente importa este módulo de forma dinámica, cuando la sección se
 * acerca, para que three.js no pese en la carga de la portada; y el bucle
 * solo corre con la sección en pantalla y el modelo ya descargado. Si no hay
 * WebGL, `WebGLRenderer` lanza; si el modelo no llega, se avisa con
 * `alFallar`. En los dos casos el componente pasa a su versión quieta.
 */

const COSTURA_1 = 1 / 3;
const COSTURA_2 = 2 / 3;
/** Momento en que aparece cada detalle del texto, paso a paso. */
const MOMENTOS = [
  [0.2, 0.25, 0.3],
  [0.4, 0.47, 0.54],
  [0.7, 0.75, 0.8],
] as const;

/** Tamaño de la pantalla HTML (`.mx`, en px CSS) antes de proyectarla. */
const PANTALLA_W = 1200;
const PANTALLA_H = 776;
const ESQUINAS_HTML = [
  0,
  0,
  PANTALLA_W,
  0,
  0,
  PANTALLA_H,
  PANTALLA_W,
  PANTALLA_H,
];

/** El portátil, preparado con scripts/preparar-macbook.mjs (medidas en cm). */
const RUTA_MODELO = "/modelos/macbook.glb";

/** Alturas relativas de la onda de la grabación (se repite). */
const ONDA = [0.3, 0.5, 0.8, 0.45, 0.9, 0.6, 0.35, 0.7, 0.5, 0.25, 0.65, 0.4];
const BARRAS_ONDA = 52;
/** Duración de la grabación de la llamada de Laura, en segundos (2m 14s). */
const DURACION_GRABACION = 134;

/**
 * Cámara (la del diseño, «En tu negocio.html» en Claude Design): grúa
 * cenital → frontal al abrir; órbita lateral baja y acercamiento en la
 * llamada; contraplano alto hacia el chat; plano general al final.
 * Fotogramas clave sobre el progreso suavizado: azimut y elevación en grados,
 * distancia relativa y altura del punto de mira (en altos de pantalla).
 */
const CAMARA_T = [0, 0.22, 0.33, 0.45, 0.62, 0.7, 0.84, 0.93, 1];
const CAMARA_AZIMUT = [-28, 0, 0, 30, 22, -20, -14, 0, 0];
const CAMARA_ELEVACION = [80, 10, 9, 5, 6, 22, 20, 10, 10];
const CAMARA_DISTANCIA = [1.18, 1, 0.97, 0.9, 0.92, 0.9, 0.88, 1, 1];
const CAMARA_MIRA = [0, 0, 0, -0.02, -0.02, -0.2, -0.2, 0, 0];

/**
 * El diseño se hizo con three.js 0.149, que leía los colores hexadecimales
 * como lineales y usaba intensidades de luz «legacy». Con la gestión de color
 * actual el mismo portátil salía casi negro en vez de gris espacial: para que
 * se vea como en Claude Design, los colores se leen como lineales y las luces
 * se multiplican por π (la equivalencia que da three desde r155).
 */
const lineal = (hex: number) => new Color().setHex(hex, LinearSRGBColorSpace);
const LUZ_LEGACY = Math.PI;

const acotar = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
/** Posición de `v` dentro del tramo [a, b], acotada a [0, 1]. */
const tramo = (v: number, a: number, b: number) => acotar((v - a) / (b - a));
/** Ease-in-out cúbico. */
const suave = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Interpola entre fotogramas clave con `suave` en cada tramo. */
function claves(v: number, xs: readonly number[], ys: readonly number[]) {
  if (v <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (v <= xs[i]) {
      const t = suave((v - xs[i - 1]) / (xs[i] - xs[i - 1]));
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[ys.length - 1];
}
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

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
function homografia(origen: number[], destino: number[]) {
  const t = multiplica(baseAPuntos(destino), adjunta(baseAPuntos(origen)));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}

/** Libera geometrías, materiales y texturas de una escena. */
function liberar(escena: Object3D) {
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

function pieza<T extends Element>(raiz: Element, selector: string): T {
  const el = raiz.querySelector<T>(selector);
  if (!el) throw new Error(`[EnTuNegocio] Falta ${selector}`);
  return el;
}

export function montarEscena(
  raiz: HTMLElement,
  alFallar: (error: unknown) => void = () => {}
): () => void {
  const escenario = pieza<HTMLElement>(raiz, ".ng-escenario");
  const lienzo = pieza<HTMLElement>(raiz, ".ng-lienzo");
  const hueco = pieza<HTMLElement>(raiz, ".ng-hueco");
  const pantallaHtml = pieza<HTMLElement>(raiz, ".mx");
  const ondaEl = pieza<HTMLElement>(raiz, ".mx-onda");
  const tiempo = pieza<HTMLElement>(raiz, ".mx-tiempo");

  // Primero el renderer: si no hay WebGL lanza aquí, antes de tocar nada.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  lienzo.appendChild(renderer.domElement);

  const todos = <T extends Element>(selector: string, dentro: Element = raiz) =>
    Array.from(dentro.querySelectorAll<T>(selector));
  const copias = todos<HTMLElement>(".ng-copia");
  const rotulos = todos<HTMLElement>(".ng-rotulo > span");
  const pasos = todos<HTMLElement>(".ng-paso");
  const rellenos = todos<HTMLElement>(".ng-relleno");
  const etiquetas = todos<HTMLElement>(".ng-etiqueta");
  const detalles = copias.map((c) => todos<HTMLElement>(".ng-detalle", c));
  const vistas = todos<HTMLElement>(".mx-vista", pantallaHtml);
  const navs = todos<HTMLElement>("[data-nav]", pantallaHtml);
  const apariciones = todos<HTMLElement>("[data-a]", pantallaHtml).map(
    (el) => ({
      el,
      a: Number(el.dataset.a),
      hasta: el.dataset.hasta ? Number(el.dataset.hasta) : null,
    })
  );
  const cifras = todos<HTMLElement>("[data-n]", pantallaHtml).map((el) => ({
    el,
    n: Number(el.dataset.n),
    sufijo: el.dataset.s ?? "",
    a: Number(el.dataset.a),
  }));
  const barras = todos<HTMLElement>("[data-b]", pantallaHtml).map((el) => ({
    el,
    a: Number(el.dataset.b),
  }));
  const velos = todos<HTMLElement>("[data-o]", pantallaHtml).map((el) => ({
    el,
    a: Number(el.dataset.o),
  }));

  // La onda de la grabación: decorativa, se genera aquí.
  const onda = Array.from({ length: BARRAS_ONDA }, (_, i) => {
    const barra = document.createElement("i");
    const alto =
      20 +
      70 * ONDA[i % ONDA.length] * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)));
    barra.style.height = `${alto}%`;
    return barra;
  });
  ondaEl.replaceChildren(...onda);

  /* ── Escena, luz y entorno ── */
  const escena = new Scene();
  const camara = new PerspectiveCamera(28, 1, 1, 800);
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
  escena.add(new HemisphereLight(0xffffff, lineal(0x444444), 0.5 * LUZ_LEGACY));
  const sol = new DirectionalLight(0xffffff, 1.1 * LUZ_LEGACY);
  sol.position.set(10, 30, 20);
  escena.add(sol);

  /* ── El portátil: el modelo 3D, que llega por red ── */
  const mac = new Group();
  escena.add(mac);
  // La tapa (con el pivote en la bisagra) y un punto en el centro de su
  // pantalla, sobre el que se proyecta el HTML. Hasta que llega el modelo no
  // se pinta nada.
  let bisagra: Object3D | null = null;
  let pantalla: Object3D | null = null;
  let esquinas: [number, number][] = [];
  let altoPantalla = 0;
  let desmontado = false;
  let listo = false;
  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(RUTA_MODELO)
    .then((gltf) => {
      if (desmontado) return liberar(gltf.scene);
      const tapa = gltf.scene.getObjectByName("Tapa");
      const cristal = gltf.scene.getObjectByName("Pantalla");
      if (!tapa || !cristal) {
        throw new Error("[EnTuNegocio] Al modelo le faltan Tapa y Pantalla");
      }
      // La tapa llega vertical y sin girar: la caja del cristal en el mundo,
      // pasada al espacio de la tapa, es el rectángulo de la pantalla. Caja
      // precisa (vértice a vértice): la geometría del cristal viene inclinada
      // en su propio espacio, y la caja rápida la engordaba varios cm.
      gltf.scene.updateMatrixWorld(true);
      const caja = new Box3().setFromObject(cristal, true);
      tapa.worldToLocal(caja.min);
      tapa.worldToLocal(caja.max);
      const ancho = caja.max.x - caja.min.x;
      altoPantalla = (ancho * PANTALLA_H) / PANTALLA_W;
      esquinas = [
        [-ancho / 2, altoPantalla / 2],
        [ancho / 2, altoPantalla / 2],
        [-ancho / 2, -altoPantalla / 2],
        [ancho / 2, -altoPantalla / 2],
      ];
      const plano = new Object3D();
      plano.position.set(
        (caja.min.x + caja.max.x) / 2,
        (caja.min.y + caja.max.y) / 2,
        caja.max.z + 0.02
      );
      tapa.add(plano);
      bisagra = tapa;
      pantalla = plano;
      mac.add(gltf.scene);
      sombra.visible = true;
      listo = true;
      quizaArrancar();
    })
    .catch((error: unknown) => {
      if (!desmontado) alFallar(error);
    });

  // Sombra de contacto: un degradado radial pintado en canvas.
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
  mac.add(sombra);

  /* ── Encuadre: el portátil se centra en el hueco de la rejilla ── */
  let anchoEscenario = 1;
  let altoEscenario = 1;
  let fraccionW = 1;
  let fraccionH = 1;
  function medir() {
    const r = escenario.getBoundingClientRect();
    const h = hueco.getBoundingClientRect();
    anchoEscenario = r.width;
    altoEscenario = r.height;
    renderer.setSize(anchoEscenario, altoEscenario, false);
    camara.aspect = anchoEscenario / Math.max(1, altoEscenario);
    const centroX = h.left - r.left + h.width / 2;
    const centroY = h.top - r.top + h.height / 2;
    fraccionW = Math.max(0.2, h.width / anchoEscenario);
    fraccionH = Math.max(0.2, h.height / altoEscenario);
    camara.setViewOffset(
      anchoEscenario,
      altoEscenario,
      anchoEscenario / 2 - centroX,
      altoEscenario / 2 - centroY,
      anchoEscenario,
      altoEscenario
    );
    camara.updateProjectionMatrix();
  }
  const alCambiarTamano = new ResizeObserver(medir);
  alCambiarTamano.observe(escenario);
  alCambiarTamano.observe(hueco);
  medir();

  /* ── Progreso del scroll ── */
  let crudo = 0;
  let suavizado = 0;
  let pasoActual = -1;
  function leerProgreso() {
    const r = raiz.getBoundingClientRect();
    const recorrido = raiz.offsetHeight - window.innerHeight;
    crudo = acotar(-r.top / recorrido);
    // Al acabar, el escenario se despide mientras entra la sección siguiente
    // (misma salida que «En tu bolsillo»).
    const salida = acotar((-r.top - recorrido) / window.innerHeight);
    escenario.style.opacity = String(1 - tramo(salida, 0, 0.55));
    escenario.style.transform =
      salida > 0 ? `translateY(${-64 * salida}px)` : "";
  }
  window.addEventListener("scroll", leerProgreso, { passive: true });
  window.addEventListener("resize", leerProgreso);
  leerProgreso();
  suavizado = crudo;

  /* ── Fotograma ── */
  const mira = new Vector3();
  const v = new Vector3();
  const normal = new Vector3();
  const giro = new Quaternion();
  const reposo = new Vector3(0, 1, 0);
  const grados = MathUtils.degToRad;
  const tangente = Math.tan(grados(14));

  function cambiarDePaso(paso: number) {
    copias.forEach(
      (c, i) => (c.style.visibility = i === paso ? "visible" : "hidden")
    );
    rotulos.forEach(
      (r, i) => (r.style.visibility = i === paso ? "visible" : "hidden")
    );
    etiquetas.forEach((e, i) => e.toggleAttribute("data-activo", i === paso));
    pasos.forEach((b, i) => {
      if (i === paso) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    vistas.forEach(
      (vista, i) =>
        (vista.style.display =
          i === paso ? (i === 2 ? "flex" : "block") : "none")
    );
    navs.forEach((n) =>
      n.toggleAttribute("data-activo", Number(n.dataset.nav) === paso)
    );
  }

  function pintarTextos(p: number) {
    const desplazamientos = [
      claves(p, [0.3, COSTURA_1], [0, -20]),
      claves(p, [COSTURA_1, 0.36, 0.64, COSTURA_2], [20, 0, 0, -20]),
      claves(p, [COSTURA_2, 0.69], [20, 0]),
    ];
    copias.forEach(
      (c, i) => (c.style.transform = `translateY(${desplazamientos[i]}px)`)
    );
    detalles.forEach((lista, i) =>
      lista.forEach((d, j) => {
        const a = MOMENTOS[i][j];
        const t = tramo(p, a, a + 0.03);
        d.style.opacity = String(t);
        d.style.transform = `translateY(${8 * (1 - t)}px)`;
      })
    );
    rellenos[0].style.transform = `scaleX(${tramo(crudo, 0, COSTURA_1)})`;
    rellenos[1].style.transform = `scaleX(${tramo(crudo, COSTURA_1, COSTURA_2)})`;
    rellenos[2].style.transform = `scaleX(${tramo(crudo, COSTURA_2, 1)})`;
  }

  function pintarPantalla(p: number) {
    for (const o of apariciones) {
      let t = tramo(p, o.a, o.a + 0.022);
      if (o.hasta !== null) t *= 1 - tramo(p, o.hasta, o.hasta + 0.005);
      o.el.style.opacity = String(t);
      o.el.style.transform = `translateY(${12 * (1 - t)}px)`;
      o.el.style.display =
        o.hasta !== null && t === 0 && p > o.hasta ? "none" : "";
    }
    for (const o of cifras) {
      const t = suave(tramo(p, o.a, o.a + 0.07));
      o.el.textContent = miles(Math.round(o.n * t)) + o.sufijo;
    }
    for (const o of barras) {
      o.el.style.transform = `scaleY(${suave(tramo(p, o.a, o.a + 0.03))})`;
    }
    for (const o of velos)
      o.el.style.opacity = String(tramo(p, o.a, o.a + 0.02));
    // La grabación «suena» con el scroll mientras se lee la llamada.
    const reproducido = tramo(p, 0.4, 0.6);
    onda.forEach((b, i) =>
      b.classList.toggle("on", i / onda.length < reproducido)
    );
    const segundos = Math.round(reproducido * DURACION_GRABACION);
    tiempo.textContent = `0${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  }

  function pintarPortatil(p: number) {
    if (!bisagra || !pantalla) return;
    const abierto = suave(tramo(p, 0.02, 0.2));
    bisagra.rotation.x = grados(90 - 108 * abierto);
    mac.updateMatrixWorld(true);

    // Con la tapa cerrada se mira al portátil; al abrirse, a la pantalla.
    v.set(0, altoPantalla * claves(p, CAMARA_T, CAMARA_MIRA), 0);
    pantalla.localToWorld(v);
    mira.copy(reposo).lerp(v, abierto);
    const azimut = grados(claves(p, CAMARA_T, CAMARA_AZIMUT));
    const elevacion = grados(claves(p, CAMARA_T, CAMARA_ELEVACION));
    const distancia =
      Math.max(
        40 / (fraccionW * camara.aspect * 2 * tangente),
        30 / (fraccionH * 2 * tangente)
      ) * claves(p, CAMARA_T, CAMARA_DISTANCIA);
    camara.position.set(
      mira.x + distancia * Math.cos(elevacion) * Math.sin(azimut),
      mira.y + distancia * Math.sin(elevacion),
      mira.z + distancia * Math.cos(elevacion) * Math.cos(azimut)
    );
    camara.lookAt(mira);
    camara.updateMatrixWorld();
    sombra.scale.set(58, 40 + 10 * abierto, 1);
    sombra.position.z = -4 * abierto;
    renderer.render(escena, camara);

    // La pantalla HTML se enciende al abrir y solo se ve de frente.
    pantalla.getWorldQuaternion(giro);
    normal.set(0, 0, 1).applyQuaternion(giro);
    pantalla.getWorldPosition(v);
    const deFrente = normal.dot(v.sub(camara.position).negate().normalize());
    const luz = tramo(abierto, 0.45, 0.9) * acotar(deFrente * 4);
    if (luz <= 0) {
      pantallaHtml.style.display = "none";
      return;
    }
    const destino: number[] = [];
    for (const [x, y] of esquinas) {
      v.set(x, y, 0);
      pantalla.localToWorld(v);
      v.project(camara);
      destino.push(
        ((v.x + 1) / 2) * anchoEscenario,
        ((1 - v.y) / 2) * altoEscenario
      );
    }
    pantallaHtml.style.display = "block";
    pantallaHtml.style.opacity = String(luz);
    pantallaHtml.style.transform = homografia(ESQUINAS_HTML, destino);
  }

  let raf = 0;
  function fotograma() {
    suavizado += (crudo - suavizado) * 0.12;
    if (Math.abs(crudo - suavizado) < 1e-4) suavizado = crudo;
    const paso = crudo >= COSTURA_2 ? 2 : crudo >= COSTURA_1 ? 1 : 0;
    if (paso !== pasoActual) {
      pasoActual = paso;
      cambiarDePaso(paso);
    }
    pintarTextos(suavizado);
    pintarPantalla(suavizado);
    pintarPortatil(suavizado);
    raf = requestAnimationFrame(fotograma);
  }

  // El bucle solo corre con la sección en pantalla y el modelo ya cargado.
  let aLaVista = false;
  function quizaArrancar() {
    if (listo && aLaVista && !raf) raf = requestAnimationFrame(fotograma);
  }
  const enPantalla = new IntersectionObserver(([entrada]) => {
    aLaVista = entrada.isIntersecting;
    if (aLaVista) {
      quizaArrancar();
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  enPantalla.observe(raiz);

  return () => {
    desmontado = true;
    cancelAnimationFrame(raf);
    raf = 0;
    enPantalla.disconnect();
    alCambiarTamano.disconnect();
    window.removeEventListener("scroll", leerProgreso);
    window.removeEventListener("resize", leerProgreso);
    liberar(escena);
    liberar(estudio);
    entorno.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
