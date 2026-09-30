import {
  ACESFilmicToneMapping,
  Group,
  MathUtils,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

import {
  acotar,
  cargarPortatil,
  crearSombra,
  esquinasHtml,
  homografia,
  iluminar,
  liberar,
  suave,
  tramo,
  type Portatil,
} from "@/lib/portatil-3d";

/**
 * El portátil de la simulación del Gestor (`gestor-simulacion.tsx`): el
 * mismo modelo y la misma luz que «En tu negocio» (`lib/portatil-3d.ts`),
 * pero quieto. Aquí no hay escenario fijo ni progreso de scroll: la tapa se
 * abre UNA vez, cuando la sección entra en pantalla, y a partir de ahí solo
 * se vuelve a pintar si cambia el tamaño. Lo que se mueve en la pantalla es
 * HTML (la simulación), proyectado sobre la tapa con una homografía; el
 * lienzo 3D no tiene que redibujarse por eso.
 *
 * El componente importa este módulo de forma dinámica cuando la sección se
 * acerca, para que three.js no pese en la carga de la portada. Si no hay
 * WebGL, `WebGLRenderer` lanza al montar; si el modelo no llega, se avisa
 * con `alFallar`. En los dos casos el componente enseña la pantalla plana.
 */

export interface OpcionesDelPortatil {
  /** Donde va el lienzo; el portátil se encuadra en él. */
  lienzo: HTMLElement;
  /** La pantalla HTML, colocada en el mismo origen que el lienzo. */
  pantallaHtml: HTMLElement;
  anchoHtml: number;
  altoHtml: number;
  alFallar: (error: unknown) => void;
}

export interface PortatilMontado {
  /** Abre la tapa: animada, o de golpe con `animar: false` (movimiento
   * reducido). Si el modelo aún no ha llegado, se abre al llegar. */
  abrir(animar: boolean): void;
  desmontar(): void;
}

/** Cámara: un poco de lado y baja, para que el portátil se vea en 3D sin
 * deformar la pantalla. Mientras la tapa se abre, la cámara baja desde un
 * plano más alto. Ángulos en grados. */
const AZIMUT = [-26, -13];
const ELEVACION = [36, 8];
const DISTANCIA = [1.36, 1.22];
/** A dónde mira la cámara con la tapa abierta, en altos de pantalla desde
 * su centro: un poco por debajo, para que la base quepa en el encuadre. */
const MIRA = -0.18;
const APERTURA_GRADOS = 108;
const DURACION_APERTURA_MS = 1200;
/**
 * Ángulo vertical de la cámara. Con un teleobjetivo la cámara se aleja y la
 * tapa y la base se ven del mismo ancho (ver `en-tu-negocio-escena.ts`).
 */
const CAMARA_FOV = 15;

const mezcla = (a: number, b: number, t: number) => a + (b - a) * t;

export function montarPortatil(opciones: OpcionesDelPortatil): PortatilMontado {
  const { lienzo, pantallaHtml, anchoHtml, altoHtml, alFallar } = opciones;

  // Primero el renderer: si no hay WebGL lanza aquí, antes de tocar nada.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  lienzo.appendChild(renderer.domElement);

  const escena = new Scene();
  const camara = new PerspectiveCamera(CAMARA_FOV, 1, 1, 2000);
  const apagarLuces = iluminar(renderer, escena);
  const mac = new Group();
  escena.add(mac);
  const sombra = crearSombra();
  mac.add(sombra);
  const esquinasDeLaPantalla = esquinasHtml(anchoHtml, altoHtml);

  let portatil: Portatil | null = null;
  let desmontado = false;
  let abierto = 0;
  let aperturaPedida: boolean | null = null;
  let raf = 0;

  cargarPortatil(anchoHtml, altoHtml)
    .then((cargado) => {
      if (desmontado) return liberar(cargado.modelo);
      portatil = cargado;
      mac.add(cargado.modelo);
      sombra.visible = true;
      if (aperturaPedida !== null) empezar(aperturaPedida);
      else pintar();
    })
    .catch((error: unknown) => {
      if (!desmontado) alFallar(error);
    });

  /* ── Encuadre ── */
  let ancho = 1;
  let alto = 1;
  function medir() {
    const r = lienzo.getBoundingClientRect();
    ancho = Math.max(1, r.width);
    alto = Math.max(1, r.height);
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    if (portatil) pintar();
  }
  const alCambiarTamano = new ResizeObserver(medir);
  alCambiarTamano.observe(lienzo);
  medir();

  /* ── Fotograma ── */
  const mira = new Vector3();
  const v = new Vector3();
  const normal = new Vector3();
  const giro = new Quaternion();
  const reposo = new Vector3(0, 1, 0);
  const grados = MathUtils.degToRad;
  const tangente = Math.tan(grados(CAMARA_FOV / 2));

  function pintar() {
    if (!portatil) return;
    const { tapa, pantalla, esquinas, altoPantalla } = portatil;
    tapa.rotation.x = grados(90 - APERTURA_GRADOS * abierto);
    mac.updateMatrixWorld(true);

    // Con la tapa cerrada se mira al portátil; al abrirse, a la pantalla.
    v.set(0, MIRA * altoPantalla, 0);
    pantalla.localToWorld(v);
    mira.copy(reposo).lerp(v, abierto);
    const azimut = grados(mezcla(AZIMUT[0], AZIMUT[1], abierto));
    const elevacion = grados(mezcla(ELEVACION[0], ELEVACION[1], abierto));
    const distancia =
      Math.max(40 / (camara.aspect * 2 * tangente), 30 / (2 * tangente)) *
      mezcla(DISTANCIA[0], DISTANCIA[1], abierto);
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
      destino.push(((v.x + 1) / 2) * ancho, ((1 - v.y) / 2) * alto);
    }
    pantallaHtml.style.display = "block";
    pantallaHtml.style.opacity = String(luz);
    pantallaHtml.style.transform = homografia(esquinasDeLaPantalla, destino);
  }

  function empezar(animar: boolean) {
    if (!animar) {
      abierto = 1;
      pintar();
      return;
    }
    const inicio = performance.now();
    const paso = (ahora: number) => {
      abierto = suave(tramo((ahora - inicio) / DURACION_APERTURA_MS, 0, 1));
      pintar();
      raf = abierto < 1 ? requestAnimationFrame(paso) : 0;
    };
    raf = requestAnimationFrame(paso);
  }

  return {
    abrir(animar) {
      if (aperturaPedida !== null) return;
      aperturaPedida = animar;
      if (portatil) empezar(animar);
    },
    desmontar() {
      desmontado = true;
      cancelAnimationFrame(raf);
      alCambiarTamano.disconnect();
      liberar(escena);
      apagarLuces();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
