import {
  ACESFilmicToneMapping,
  Box3,
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
import {
  ESQUINA,
  NEGOCIO_P,
  RADIO_TAPA_CM,
  leerEsquinaTelefono,
  marcarNegocioEnEscena,
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
 * con la tapa cerrada vista desde arriba, su esquina trasera izquierda justo
 * sobre la del teléfono volcado y con el mismo radio; en el zoom out la
 * cámara se aleja de esa esquina hasta el encuadre del paso 1; y al llegar
 * entra el título. Los pasos van sobre el progreso que queda (FIN_ZOOM→1),
 * estirado a 0→1: sus pistas son las de siempre.
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
  finTitulo: FIN_TITULO,
} = NEGOCIO_P;
/**
 * Elevación de la cámara en la vista cenital de la esquina (casi vertical:
 * a 90° justos `lookAt` no sabe dónde está arriba). Con azimut 0, arriba en
 * pantalla es la bisagra (−z) e izquierda es −x.
 */
const ELEVACION_CENITAL = 89.5;
/** Momento en que aparece cada detalle del texto, paso a paso. */
const MOMENTOS = [
  [0.2, 0.25, 0.3],
  [0.4, 0.47, 0.54],
  [0.7, 0.75, 0.8],
] as const;

/** Tamaño de la pantalla HTML (`.mx`, en px CSS) antes de proyectarla. */
const PANTALLA_W = 1200;
const PANTALLA_H = 776;
const ESQUINAS_HTML = esquinasHtml(PANTALLA_W, PANTALLA_H);

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
  // La esquina trasera izquierda de la tapa cerrada (arriba a la izquierda
  // vista desde arriba), en cm del mundo: sobre ella cae la del teléfono.
  const esquinaTapa = new Vector3();
  let desmontado = false;
  let listo = false;
  cargarPortatil(PANTALLA_W, PANTALLA_H)
    .then((portatil) => {
      if (desmontado) return liberar(portatil.modelo);
      bisagra = portatil.tapa;
      pantalla = portatil.pantalla;
      esquinas = portatil.esquinas;
      altoPantalla = portatil.altoPantalla;
      // Con la tapa cerrada (girada 90° sobre la bisagra), su caja en el
      // mundo da la esquina: x mínima, cara de arriba, z mínima.
      portatil.tapa.rotation.x = Math.PI / 2;
      portatil.modelo.updateMatrixWorld(true);
      const cerrada = new Box3().setFromObject(portatil.tapa, true);
      esquinaTapa.set(cerrada.min.x, cerrada.max.y, cerrada.min.z);
      portatil.tapa.rotation.x = 0;
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
  suavizado = crudo;

  /* ── Fotograma ── */
  const mira = new Vector3();
  const miraEsquina = new Vector3();
  const v = new Vector3();
  const normal = new Vector3();
  const giro = new Quaternion();
  const reposo = new Vector3(0, 1, 0);
  const grados = MathUtils.degToRad;
  const tangente = Math.tan(grados(CAMARA_FOV / 2));

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

  function pintarTextos(p: number, pCrudo: number) {
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
    rellenos[0].style.transform = `scaleX(${tramo(pCrudo, 0, COSTURA_1)})`;
    rellenos[1].style.transform = `scaleX(${tramo(pCrudo, COSTURA_1, COSTURA_2)})`;
    rellenos[2].style.transform = `scaleX(${tramo(pCrudo, COSTURA_2, 1)})`;
  }

  /**
   * La transición desde «En tu bolsillo»: en el cruce se encienden el lienzo,
   * el fondo del escenario (hasta ahí, transparente sobre el teléfono) y el
   * crédito, sobre el progreso crudo, igual que se apaga el teléfono; el
   * texto y el rótulo entran (fade y 16 px) cuando acaba el zoom out.
   */
  function pintarTransicion(pCrudo: number, p: number) {
    const encendido = tramo(pCrudo, 0, FIN_CRUCE);
    lienzo.style.opacity = String(encendido);
    escenario.style.backgroundColor = `rgba(250, 250, 250, ${encendido})`;
    if (credito) credito.style.opacity = String(encendido);
    const entrada = tramo(p, FIN_ZOOM, FIN_TITULO);
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

  /**
   * `p` es el progreso de los pasos (el de siempre) y `pSeccion` el de toda
   * la sección, del que cuelga el zoom out de delante.
   */
  function pintarPortatil(p: number, pSeccion: number) {
    if (!bisagra || !pantalla) return;
    const abierto = suave(tramo(p, 0.02, 0.2));
    bisagra.rotation.x = grados(90 - 108 * abierto);
    mac.updateMatrixWorld(true);

    // Con la tapa cerrada se mira al portátil; al abrirse, a la pantalla.
    v.set(0, altoPantalla * claves(p, CAMARA_T, CAMARA_MIRA), 0);
    pantalla.localToWorld(v);
    mira.copy(reposo).lerp(v, abierto);
    let azimut = grados(claves(p, CAMARA_T, CAMARA_AZIMUT));
    let elevacion = grados(claves(p, CAMARA_T, CAMARA_ELEVACION));
    let distancia =
      Math.max(
        40 / (fraccionW * camara.aspect * 2 * tangente),
        30 / (fraccionH * 2 * tangente)
      ) * claves(p, CAMARA_T, CAMARA_DISTANCIA);

    // Zoom out: de la vista cenital de la esquina de la tapa (la del teléfono
    // volcado de «En tu bolsillo», con su radio) al encuadre del paso 1. La
    // distancia va en logaritmo, para que el alejamiento sea parejo.
    const alejado = suave(tramo(pSeccion, FIN_CRUCE, FIN_ZOOM));
    if (alejado < 1) {
      const esquina = leerEsquinaTelefono() ?? {
        x: ESQUINA.x * anchoEscenario,
        y: ESQUINA.y * altoEscenario,
        radio: 0.15 * altoEscenario,
      };
      // Aumento (px por cm) que iguala los radios, y altura de la cámara
      // sobre la tapa que lo da con este objetivo.
      const aumento = esquina.radio / RADIO_TAPA_CM;
      const altura = altoEscenario / (2 * aumento * tangente);
      // El punto de mira cae en el centro del hueco; la esquina tiene que
      // caer en `esquina`: el punto de mira queda desplazado de la esquina
      // lo contrario (en pantalla, x a la derecha y z hacia abajo).
      miraEsquina.set(
        esquinaTapa.x - (esquina.x - centroX) / aumento,
        esquinaTapa.y,
        esquinaTapa.z - (esquina.y - centroY) / aumento
      );
      azimut *= alejado;
      elevacion = MathUtils.lerp(grados(ELEVACION_CENITAL), elevacion, alejado);
      distancia = Math.exp(
        MathUtils.lerp(Math.log(altura), Math.log(distancia), alejado)
      );
      mira.lerpVectors(miraEsquina, mira, alejado);
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
    // Los pasos van sobre lo que queda tras el zoom out, estirado a 0→1.
    const pasosCrudo = tramo(crudo, FIN_ZOOM, 1);
    const pasos = tramo(suavizado, FIN_ZOOM, 1);
    const paso = pasosCrudo >= COSTURA_2 ? 2 : pasosCrudo >= COSTURA_1 ? 1 : 0;
    if (paso !== pasoActual) {
      pasoActual = paso;
      cambiarDePaso(paso);
    }
    pintarTransicion(crudo, suavizado);
    pintarTextos(pasos, pasosCrudo);
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
    liberar(escena);
    apagarLuces();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
