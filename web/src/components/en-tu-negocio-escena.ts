import {
  ACESFilmicToneMapping,
  Group,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";

import {
  acotar,
  cargarPortatil,
  claves,
  crearSombra,
  esquinasHtml,
  homografia,
  iluminar,
  liberar,
  suave,
  tramo,
} from "@/lib/portatil-3d";
import { desbloqueo, pintarBloqueo } from "@/lib/pantalla-bloqueo";
import { escucharScrollSuave, progresoDe } from "@/lib/scroll-suave";
import {
  NEGOCIO_P,
  PANTALLA_HTML,
  leerTelefono,
  marcarNegocioEnEscena,
  pantallaDelPortatil,
  vhRelevoDesdeNegocio,
} from "@/lib/transicion-bolsillo-negocio";

/**
 * Motor de «En tu negocio» (`en-tu-negocio.tsx`). Recibe la <section> ya
 * pintada por React y le da vida: el progreso del scroll abre la tapa del
 * portátil, mueve la cámara, cambia la pantalla y va enseñando los textos.
 * Devuelve la limpieza.
 *
 * El portátil es un modelo 3D (ver `lib/portatil-3d.ts`: el modelo, su
 * crédito obligatorio, la luz de estudio y la homografía son comunes con la
 * simulación del Gestor). Lo que se ve en su pantalla es HTML normal (el
 * `.mx` de la sección), proyectado sobre la tapa con una homografía
 * (`matrix3d`) que lleva sus cuatro esquinas a las de la pantalla 3D. Así el
 * texto sigue nítido y la pantalla es la de la app de verdad.
 *
 * Mismas reglas que «En tu bolsillo» (`llamada-scroll.tsx`): la presencia de
 * cada paso cambia de golpe en las costuras (1/3 y 2/3) sobre el progreso
 * crudo, y todo lo demás va sobre un progreso suavizado.
 *
 * Delante de los tres pasos va la transición desde «En tu bolsillo»
 * (`lib/transicion-bolsillo-negocio.ts`): en el cruce el lienzo se enciende
 * con el portátil abierto, visto de frente y tan cerca que su pantalla,
 * apagada, envuelve al teléfono tumbado (negro sobre negro); en el zoom out
 * la pantalla se enciende con el panel, la cámara se aleja hasta el encuadre
 * del paso 1 y entra el texto. Los pasos van sobre el progreso que queda
 * (FIN_ZOOM→1), estirado a 0→1.
 *
 * El componente importa este módulo de forma dinámica, cuando la sección se
 * acerca, para que three.js no pese en la carga de la portada; y el bucle
 * solo corre con la sección en pantalla y el modelo ya descargado. Si no hay
 * WebGL, `WebGLRenderer` lanza; si el modelo no llega, se avisa con
 * `alFallar`. En los dos casos el componente pasa a su versión quieta.
 */

const COSTURA_1 = 1 / 3;
const COSTURA_2 = 2 / 3;
const {
  finCruce: FIN_CRUCE,
  finZoom: FIN_ZOOM,
  inicioTitulo: INICIO_TITULO,
  finTitulo: FIN_TITULO,
} = NEGOCIO_P;
/** Apertura de la tapa, en grados desde cerrada: siempre abierta. */
const APERTURA = 108;
/**
 * En el cruce, la pantalla negra aparece (sobre el rectángulo negro de «En
 * tu bolsillo», que ya está ahí) en su primera parte.
 */
const FIN_PANTALLA_NEGRA = FIN_CRUCE * 0.3;
/** Momento en que aparece cada detalle del texto, paso a paso. */
const MOMENTOS = [
  [0.2, 0.25, 0.3],
  [0.4, 0.47, 0.54],
  [0.7, 0.75, 0.8],
] as const;

/** Tamaño de la pantalla HTML (`.mx`, en px CSS) antes de proyectarla. */
const { ancho: PANTALLA_W, alto: PANTALLA_H } = PANTALLA_HTML;
const ESQUINAS_HTML = esquinasHtml(PANTALLA_W, PANTALLA_H);

/** Alturas relativas de la onda de la grabación (se repite). */
const ONDA = [0.3, 0.5, 0.8, 0.45, 0.9, 0.6, 0.35, 0.7, 0.5, 0.25, 0.65, 0.4];
const BARRAS_ONDA = 52;
/** Duración de la grabación de la llamada de Laura, en segundos (2m 14s). */
const DURACION_GRABACION = 134;

/**
 * Cámara (la del diseño, «En tu negocio.html» en Claude Design): frontal en
 * el panel, que remata el zoom out con un leve giro; órbita lateral baja y
 * acercamiento en la llamada; contraplano alto hacia el chat; plano general
 * al final. (Hasta el 2026-10-01 el paso 1 era una grúa cenital mientras se
 * abría la tapa; ahora la tapa llega abierta desde el cruce.) Fotogramas
 * clave sobre el progreso suavizado: azimut y elevación en grados, distancia
 * relativa y altura del punto de mira (en altos de pantalla).
 */
const CAMARA_T = [0, 0.22, 0.33, 0.45, 0.62, 0.7, 0.84, 0.93, 1];
const CAMARA_AZIMUT = [-7, 0, 0, 30, 22, -20, -14, 0, 0];
const CAMARA_ELEVACION = [13, 10, 9, 5, 6, 22, 20, 10, 10];
const CAMARA_DISTANCIA = [1.04, 1, 0.97, 0.9, 0.92, 0.9, 0.88, 1, 1];
const CAMARA_MIRA = [0, 0, 0, -0.02, -0.02, -0.2, -0.2, 0, 0];
/**
 * Ángulo vertical de la cámara, en grados. El diseño usaba 28°, pero con el
 * modelo real la cámara quedaba tan cerca que la base, más próxima, se veía
 * mucho más ancha que la tapa. Con un teleobjetivo la cámara se aleja (el
 * encuadre se calcula con este mismo ángulo) y tapa y base se ven iguales.
 */
const CAMARA_FOV = 15;

const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

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
  const texto = pieza<HTMLElement>(raiz, ".ng-texto");
  const rotulo = pieza<HTMLElement>(raiz, ".ng-rotulo");
  const credito = raiz.querySelector<HTMLElement>(".ng-credito");
  const pantallaHtml = pieza<HTMLElement>(raiz, ".mx");
  const bloqueo = pieza<HTMLElement>(raiz, ".mx-bloqueo");
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
  const detalles = copias.map((c) => todos<HTMLElement>(".ng-detalle", c));
  const vistas = todos<HTMLElement>(".mx-vista", pantallaHtml);
  const navs = todos<HTMLElement>("[data-nav]", pantallaHtml);
  const apariciones = todos<HTMLElement>("[data-a]", pantallaHtml).map(
    (el) => ({
      el,
      a: Number(el.dataset.a),
      hasta: el.dataset.hasta ? Number(el.dataset.hasta) : null,
      // `data-pliega`: no ocupa sitio hasta que aparece (los turnos de la
      // transcripción, que van como un chat: el último abajo).
      pliega: el.hasAttribute("data-pliega"),
    })
  );
  const cifras = todos<HTMLElement>("[data-n]", pantallaHtml).map((el) => ({
    el,
    n: Number(el.dataset.n),
    sufijo: el.dataset.s ?? "",
    a: Number(el.dataset.a),
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
  const camara = new PerspectiveCamera(CAMARA_FOV, 1, 1, 2000);
  const apagarLuces = iluminar(renderer, escena);

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
  let anchoPantalla = 1;
  let desmontado = false;
  let listo = false;
  cargarPortatil(PANTALLA_W, PANTALLA_H)
    .then((portatil) => {
      if (desmontado) return liberar(portatil.modelo);
      bisagra = portatil.tapa;
      pantalla = portatil.pantalla;
      esquinas = portatil.esquinas;
      altoPantalla = portatil.altoPantalla;
      anchoPantalla = esquinas[1][0] - esquinas[0][0];
      portatil.tapa.rotation.x = MathUtils.degToRad(90 - APERTURA);
      mac.add(portatil.modelo);
      sombra.visible = true;
      listo = true;
      // Con el portátil ya aquí, «En tu bolsillo» apaga el teléfono en el
      // cruce y deja que la tapa lo releve. Antes no: se apagaría sobre nada.
      marcarNegocioEnEscena(true);
      quizaArrancar();
    })
    .catch((error: unknown) => {
      if (!desmontado) alFallar(error);
    });

  const sombra = crearSombra();
  const sombraMaterial = sombra.material as Material;
  // Bajo el portátil abierto: algo más honda y retrasada que bajo la base.
  sombra.scale.set(58, 50, 1);
  sombra.position.z = -4;
  mac.add(sombra);

  /* ── Encuadre: el portátil se centra en el hueco de la rejilla ── */
  let anchoEscenario = 1;
  let altoEscenario = 1;
  let fraccionW = 1;
  let fraccionH = 1;
  // El centro del hueco, en px del escenario: ahí cae el punto de mira.
  let centroX = 0;
  let centroY = 0;
  function medir() {
    const r = escenario.getBoundingClientRect();
    const h = hueco.getBoundingClientRect();
    anchoEscenario = r.width;
    altoEscenario = r.height;
    renderer.setSize(anchoEscenario, altoEscenario, false);
    camara.aspect = anchoEscenario / Math.max(1, altoEscenario);
    centroX = h.left - r.left + h.width / 2;
    centroY = h.top - r.top + h.height / 2;
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
  // El progreso suavizado sale del scroll suave compartido con «En tu
  // bolsillo» (ver lib/scroll-suave.ts): mismo valor, mismo instante, así
  // que en el relevo las dos secciones no se despegan.
  const dejarDeEscuchar = escucharScrollSuave((y) => {
    suavizado = progresoDe(raiz, y);
  });

  /* ── Fotograma ── */
  const mira = new Vector3();
  const miraFrente = new Vector3();
  const v = new Vector3();
  const eje = new Vector3();
  const normal = new Vector3();
  const giro = new Quaternion();
  const grados = MathUtils.degToRad;
  const tangente = Math.tan(grados(CAMARA_FOV / 2));

  function cambiarDePaso(paso: number) {
    copias.forEach(
      (c, i) => (c.style.visibility = i === paso ? "visible" : "hidden")
    );
    rotulos.forEach(
      (r, i) => (r.style.visibility = i === paso ? "visible" : "hidden")
    );
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
    // El riel de pasos (vertical) se llena con el progreso suavizado.
    rellenos[0].style.transform = `scaleY(${tramo(p, 0, COSTURA_1)})`;
    rellenos[1].style.transform = `scaleY(${tramo(p, COSTURA_1, COSTURA_2)})`;
    rellenos[2].style.transform = `scaleY(${tramo(p, COSTURA_2, 1)})`;
  }

  /**
   * La transición desde «En tu bolsillo»: en el cruce se encienden el lienzo,
   * el fondo del escenario (hasta ahí, transparente sobre el teléfono) y el
   * crédito, sobre el progreso suavizado, para que el portátil aparezca poco
   * a poco aunque el scroll vaya a saltos; el texto y el rótulo entran (fade
   * y 16 px) durante el zoom out.
   */
  function pintarTransicion(p: number) {
    const encendido = suave(tramo(p, 0, FIN_CRUCE));
    // Nunca 0 del todo: con opacidad 0 el navegador no compone el lienzo y
    // la primera vez que aparece se para un instante (medido: ~200 ms) justo
    // en mitad del cruce. A 0,001 no se ve y ya está compuesto.
    lienzo.style.opacity = String(Math.max(0.001, encendido));
    escenario.style.backgroundColor = `rgba(250, 250, 250, ${encendido})`;
    if (credito) credito.style.opacity = String(encendido);
    const entrada = tramo(p, INICIO_TITULO, FIN_TITULO);
    for (const el of [texto, rotulo]) {
      el.style.opacity = String(entrada);
      el.style.transform = `translateY(${16 * (1 - entrada)}px)`;
      el.style.visibility = entrada > 0 ? "visible" : "hidden";
    }
  }

  function pintarPantalla(p: number) {
    for (const o of apariciones) {
      let t = tramo(p, o.a, o.a + 0.022);
      if (o.hasta !== null) t *= 1 - tramo(p, o.hasta, o.hasta + 0.005);
      o.el.style.opacity = String(t);
      o.el.style.transform = `translateY(${12 * (1 - t)}px)`;
      o.el.style.display =
        (o.hasta !== null && t === 0 && p > o.hasta) || (o.pliega && t === 0)
          ? "none"
          : "";
    }
    for (const o of cifras) {
      const t = suave(tramo(p, o.a, o.a + 0.07));
      o.el.textContent = miles(Math.round(o.n * t)) + o.sufijo;
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

  /**
   * `p` es el progreso de los pasos (el de siempre) y `pSeccion` el de toda
   * la sección, del que cuelgan el zoom out y el desbloqueo de la pantalla.
   */
  function pintarPortatil(p: number, pSeccion: number) {
    if (!bisagra || !pantalla) return;
    mac.updateMatrixWorld(true);

    v.set(0, altoPantalla * claves(p, CAMARA_T, CAMARA_MIRA), 0);
    pantalla.localToWorld(mira.copy(v));
    let azimut = grados(claves(p, CAMARA_T, CAMARA_AZIMUT));
    let elevacion = grados(claves(p, CAMARA_T, CAMARA_ELEVACION));
    let distancia =
      Math.max(
        40 / (fraccionW * camara.aspect * 2 * tangente),
        30 / (fraccionH * 2 * tangente)
      ) * claves(p, CAMARA_T, CAMARA_DISTANCIA);

    // Zoom out: de la pantalla vista de frente, envolviendo al teléfono
    // tumbado de «En tu bolsillo», al encuadre del paso 1, con arranque y
    // llegada suaves. Durante el cruce la cámara está quieta: debajo, el
    // rectángulo negro de «En tu bolsillo» tiene que seguir encajando. La
    // distancia va en logaritmo, para que el alejamiento sea parejo.
    const alejado = suave(tramo(pSeccion, FIN_CRUCE, FIN_ZOOM));
    if (alejado < 1) {
      const telefono = leerTelefono() ?? {
        x: centroX,
        y: centroY,
        ancho: 0.8 * fraccionW * anchoEscenario,
        alto: 0,
        radio: 0,
      };
      // Aumento (px por cm) que da a la pantalla el ancho que le toca (el
      // del teléfono más la holgura), y distancia de la cámara que lo da con
      // este objetivo.
      const aumento = pantallaDelPortatil(telefono).ancho / anchoPantalla;
      const cerca = altoEscenario / (2 * aumento * tangente);
      // La cámara mira la pantalla de frente, por su normal. El punto de
      // mira cae en el centro del hueco y el de la pantalla tiene que caer en
      // el del teléfono: el punto de mira se desplaza lo contrario, en los
      // ejes de la pantalla (x a la derecha, y hacia arriba).
      pantalla.getWorldQuaternion(giro);
      pantalla.getWorldPosition(miraFrente);
      eje.set(1, 0, 0).applyQuaternion(giro);
      miraFrente.addScaledVector(eje, -(telefono.x - centroX) / aumento);
      eje.set(0, 1, 0).applyQuaternion(giro);
      miraFrente.addScaledVector(eje, (telefono.y - centroY) / aumento);
      normal.set(0, 0, 1).applyQuaternion(giro);
      azimut = MathUtils.lerp(Math.atan2(normal.x, normal.z), azimut, alejado);
      elevacion = MathUtils.lerp(Math.asin(normal.y), elevacion, alejado);
      distancia = Math.exp(
        MathUtils.lerp(Math.log(cerca), Math.log(distancia), alejado)
      );
      mira.lerpVectors(miraFrente, mira, alejado);
    }
    // La sombra de contacto se va con el zoom: de tan cerca sería un velo.
    sombraMaterial.opacity = alejado;

    camara.position.set(
      mira.x + distancia * Math.cos(elevacion) * Math.sin(azimut),
      mira.y + distancia * Math.sin(elevacion),
      mira.z + distancia * Math.cos(elevacion) * Math.cos(azimut)
    );
    camara.lookAt(mira);
    camara.updateMatrixWorld();
    renderer.render(escena, camara);

    // La pantalla HTML solo se ve de frente. Llega apagada (negra, como el
    // teléfono que releva) y se enciende al empezar el zoom out.
    pantalla.getWorldQuaternion(giro);
    normal.set(0, 0, 1).applyQuaternion(giro);
    pantalla.getWorldPosition(v);
    const deFrente = normal.dot(v.sub(camara.position).negate().normalize());
    const luz = acotar(deFrente * 4);
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
    // En el cruce, la pantalla llega bloqueada (la misma pantalla de bloqueo
    // que el rectángulo negro de «En tu bolsillo», justo encima) y se
    // desbloquea con el zoom out, dejando ver el panel. Antes del cruce el
    // escenario aún no está fijo: no se pinta.
    const negra = tramo(pSeccion, 0, FIN_PANTALLA_NEGRA);
    const vh = vhRelevoDesdeNegocio(pSeccion);
    const bloqueada = 1 - desbloqueo(vh);
    pantallaHtml.style.display = crudo > 0 ? "block" : "none";
    pantallaHtml.style.opacity = String(luz * negra);
    bloqueo.style.display = bloqueada > 0 ? "block" : "none";
    if (bloqueada > 0) {
      bloqueo.style.opacity = String(bloqueada);
      // Lo que mide la pantalla proyectada por cada px de la pantalla HTML:
      // con eso la pantalla de bloqueo saca sus mínimos legibles en px reales.
      const escala =
        Math.hypot(destino[2] - destino[0], destino[3] - destino[1]) /
        PANTALLA_W;
      bloqueo.style.setProperty("--escala", escala.toFixed(4));
      pintarBloqueo(bloqueo, vh);
    }
    pantallaHtml.style.transform = homografia(ESQUINAS_HTML, destino);
  }

  let raf = 0;
  function fotograma() {
    // Los pasos van sobre lo que queda tras el zoom out, estirado a 0→1.
    const pasosCrudo = tramo(crudo, FIN_ZOOM, 1);
    const pasos = tramo(suavizado, FIN_ZOOM, 1);
    const paso = pasosCrudo >= COSTURA_2 ? 2 : pasosCrudo >= COSTURA_1 ? 1 : 0;
    if (paso !== pasoActual) {
      pasoActual = paso;
      cambiarDePaso(paso);
    }
    pintarTransicion(suavizado);
    pintarTextos(pasos);
    pintarPantalla(pasos);
    pintarPortatil(pasos, suavizado);
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
    marcarNegocioEnEscena(false);
    cancelAnimationFrame(raf);
    raf = 0;
    enPantalla.disconnect();
    alCambiarTamano.disconnect();
    window.removeEventListener("scroll", leerProgreso);
    window.removeEventListener("resize", leerProgreso);
    dejarDeEscuchar();
    liberar(escena);
    apagarLuces();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
