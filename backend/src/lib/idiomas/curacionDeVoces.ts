/**
 * Curación a mano de las voces Ultra que el negocio puede elegir. Junto con
 * la lista de la API de Telnyx (listVoices), es la entrada de
 * scripts/generarVocesUltra.ts, que escribe vocesUltra.ts: lo que se ofrece
 * sale de allí, no de aquí.
 *
 * Cada voz que entra lleva su descripción en español (2–5 palabras, a
 * partir de la etiqueta en inglés de Telnyx), si es recomendada (de
 * atención al cliente: el panel las enseña sin desplegar) y, si el nombre
 * de pila de Telnyx no sirve (repetido dentro del idioma, o un nombre
 * español sin su tilde), el nombre visible. Una voz nueva de Telnyx sin
 * curación no entra: el script avisa (y falla con --estricto) en vez de
 * inventarle una descripción.
 *
 * Quedan fuera, cada una con su motivo en EXCLUSIONES_DE_VOCES, los
 * duplicados (mismo nombre y misma etiqueta con otra id) y las voces de
 * efecto o de personaje que sonarían rotas en una recepción. Las deprecadas
 * y las que no tienen género no hace falta excluirlas: el script las
 * descarta solo.
 *
 * Decisiones del usuario del 2026-10-05: en español, las 29 Ultra de España
 * vigentes (es-ES, acento castellano), con Blanca y Marcos por defecto; en
 * los demás idiomas, sus voces Ultra nativas. Inventario de la API del
 * 2026-10-05.
 */
import type { CodigoDeIdioma, GeneroDeVoz } from "./catalogo.js";

/** Los idiomas que tienen voces Ultra nativas, en el orden canónico. */
export const IDIOMAS_CON_VOCES_ULTRA = [
  "es-ES",
  "en-GB",
  "fr-FR",
  "de-DE",
  "it-IT",
  "pt-PT",
  "nl-NL",
] as const satisfies readonly CodigoDeIdioma[];

export type IdiomaConVocesUltra = (typeof IDIOMAS_CON_VOCES_ULTRA)[number];

/** Un valor por cada idioma con voces Ultra. */
export type PorIdiomaUltra<T> = Readonly<Record<IdiomaConVocesUltra, T>>;

/** Un valor por id de voz (`Telnyx.Ultra.<uuid>`). */
export type PorIdDeVoz<T> = Readonly<Record<string, T>>;

/** Cómo lista Telnyx cada idioma (`language` de listVoices): las nativas
 * de alemán, italiano y neerlandés vienen sin región. */
export const LOCALE_EN_TELNYX: PorIdiomaUltra<string> = {
  "es-ES": "es-ES",
  "en-GB": "en-GB",
  "fr-FR": "fr-FR",
  "de-DE": "de",
  "it-IT": "it",
  "pt-PT": "pt-PT",
  "nl-NL": "nl",
};

/** Acento exigido (`accent` de listVoices) donde el locale no basta: en
 * español, solo las de España. */
export const ACENTO_EN_TELNYX: Partial<PorIdiomaUltra<string>> = {
  "es-ES": "Castilian",
};

/** La voz de por defecto de cada idioma y género: la primera de su género
 * en vocesUltra.ts. Las de español son las de siempre (cambiarlas cambiaría
 * el payload de Telnyx de todos los negocios que no han elegido voz). */
export const VOCES_POR_DEFECTO: PorIdiomaUltra<Record<GeneroDeVoz, string>> = {
  "es-ES": {
    femenina: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6", // Blanca
    masculina: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411", // Marcos
  },
  "en-GB": {
    femenina: "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01", // Lucy
    masculina: "Telnyx.Ultra.4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991", // George
  },
  "fr-FR": {
    femenina: "Telnyx.Ultra.c96a7d7d-3457-4979-8665-522f7b3e36fb", // Léa
    masculina: "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4", // Laurent
  },
  "de-DE": {
    femenina: "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06", // Alina
    masculina: "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954", // Lukas
  },
  "it-IT": {
    femenina: "Telnyx.Ultra.90c7d657-9599-4cd0-9ed2-2568359e4d1a", // Sofia
    masculina: "Telnyx.Ultra.79693aee-1207-4771-a01e-20c393c89e6f", // Marco
  },
  "pt-PT": {
    femenina: "Telnyx.Ultra.d4b44b9a-82bc-4b65-b456-763fce4c52f9", // Beatriz
    masculina: "Telnyx.Ultra.250fdc17-cc1b-4ff1-8538-63988791cd3e", // Paulo
  },
  "nl-NL": {
    femenina: "Telnyx.Ultra.225ba8cf-9fc2-4371-a78c-fe38ba38898a", // Anneliese
    masculina: "Telnyx.Ultra.da743a82-ddf2-4d9b-8eb8-ff67ca0b138e", // Stijn
  },
};

export interface CuracionDeVoz {
  /** Cómo suena, en español y en 2–5 palabras («Cálida y acogedora»). */
  descripcion: string;
  /** De atención al cliente. La de por defecto lo es siempre. */
  recomendada?: true;
  /** Nombre visible cuando el de pila de Telnyx no sirve. */
  nombre?: string;
}

/**
 * Por idioma, la curación de cada voz que entra, por id. En cada género, la
 * de por defecto, las recomendadas y el resto (el orden de vocesUltra.ts lo
 * decide el script, no este). El comentario es el nombre en Telnyx.
 */
export const CURACION_DE_VOCES: PorIdiomaUltra<PorIdDeVoz<CuracionDeVoz>> = {
  "es-ES": {
    // Mujeres
    // Blanca - Graceful Host
    "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6": {
      descripcion: "Cálida y acogedora",
      recomendada: true,
    },
    // Marta - Friendly Guide
    "Telnyx.Ultra.de38f545-c574-44e8-9b54-a7d6fec1c6b1": {
      descripcion: "Cercana, de atención al cliente",
      recomendada: true,
    },
    // Lara - Customer Liaison
    "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6": {
      descripcion: "Atenta y clara",
      recomendada: true,
    },
    // Eva - Service Expert
    "Telnyx.Ultra.23da166b-9675-425a-a56f-10d92da2e35f": {
      descripcion: "Profesional y serena",
      recomendada: true,
    },
    // Alicia - Walkthrough Guide
    "Telnyx.Ultra.5522c839-bbd9-4485-8d84-ba3d75cd3330": {
      descripcion: "Tranquila y reconfortante",
      recomendada: true,
    },
    // Nuria - Trusted Advisor
    "Telnyx.Ultra.9d8c6b2e-0a23-4a15-ae1b-121d5b5af417": {
      descripcion: "Serena y de confianza",
      recomendada: true,
    },
    // Ainsley - Training Host
    "Telnyx.Ultra.d6032980-a170-4fdc-adfc-aabc93db0ae4": {
      descripcion: "Acogedora y precisa",
    },
    // Alondra - Reassuring Sister
    "Telnyx.Ultra.ccfea4bf-b3f4-421e-87ed-dd05dae01431": {
      descripcion: "Cálida y protectora",
    },
    // Celia - Practical Analyst
    "Telnyx.Ultra.ad38904c-0ce9-42b1-9159-5ad5352ef089": {
      descripcion: "Reflexiva y práctica",
    },
    // Elena - Narrator
    "Telnyx.Ultra.cefcb124-080b-4655-b31f-932f3ee743de": {
      descripcion: "Suave y pausada",
    },
    // Flor - Hold Companion
    "Telnyx.Ultra.b8f073cd-cb60-43ef-aa01-feb59a8b7394": {
      descripcion: "Clara y cálida",
    },
    // Ines - Route Guide
    "Telnyx.Ultra.db74bd0c-9ea6-4d08-b78e-c3c0a54dfd2d": {
      nombre: "Inés",
      descripcion: "Natural y desenvuelta",
    },
    // Iria - Thoughtful Communicator
    "Telnyx.Ultra.a7beff01-8f8b-4809-bfe6-e2166e57e0c2": {
      descripcion: "Pausada y reflexiva",
    },
    // Isabel - Teacher
    "Telnyx.Ultra.c0c374aa-09be-42d9-9828-4d2d7df86962": {
      descripcion: "Cercana, tono de profesora",
    },
    // Lucia - Radiant Host
    "Telnyx.Ultra.c0925108-d541-4dc4-bbae-39f4e57ba10c": {
      nombre: "Lucía",
      descripcion: "Brillante y acogedora",
    },
    // Noa - Professional Assistant
    "Telnyx.Ultra.3408d527-179f-434a-94cb-962d5578642d": {
      descripcion: "Pulida y resolutiva",
    },
    // Paloma - Clear Presenter Woman
    "Telnyx.Ultra.d4db5fb9-f44b-4bd1-85fa-192e0f0d75f9": {
      descripcion: "Clara y profesional",
    },
    // Renata - Cheerful Conversationalist
    "Telnyx.Ultra.d3793b7b-4996-409c-9d59-96dd09f47717": {
      descripcion: "Animada, voz madura",
    },
    // Hombres
    // Marcos - Steady Advisor
    "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411": {
      descripcion: "Sereno y profesional",
      recomendada: true,
    },
    // Miguel - Route Guide
    "Telnyx.Ultra.d813d699-27f0-4231-83b4-6bd1bce106ba": {
      descripcion: "Suave y articulado",
      recomendada: true,
    },
    // Darío - Steady Operator
    "Telnyx.Ultra.35b2cfc1-e6fb-4d69-a598-c1780612be4a": {
      descripcion: "Seguro y sereno",
      recomendada: true,
    },
    // Octavio - Service Anchor
    "Telnyx.Ultra.9aea78cb-ba89-4a82-aa15-31b55a89b75d": {
      descripcion: "Natural y profesional",
      recomendada: true,
    },
    // Álvaro - Steady Explainer
    "Telnyx.Ultra.ca526927-b7c8-4a64-95d7-235d30b7771f": {
      descripcion: "Claro y equilibrado",
      recomendada: true,
    },
    // Rafael - Poised Advisor
    "Telnyx.Ultra.cbb6fdf0-30dd-49f6-af7d-bbb1185c1fa5": {
      descripcion: "Calmado y con autoridad",
      recomendada: true,
    },
    // Benito - Digital Voice
    "Telnyx.Ultra.02aeee94-c02b-456e-be7a-659672acf82d": {
      descripcion: "Claro y constante",
    },
    // Gonzalo - Grounded Storyteller
    "Telnyx.Ultra.58e531e3-b212-49df-adee-c335a19c2429": {
      descripcion: "Cálido y auténtico",
    },
    // Hector - Tour Leader
    "Telnyx.Ultra.b042270c-d46f-4d4f-8fb0-7dd7c5fe5615": {
      nombre: "Héctor",
      descripcion: "Enérgico y cautivador",
    },
    // Luis - News Caster
    "Telnyx.Ultra.b5aa8098-49ef-475d-89b0-c9262ecf33fd": {
      descripcion: "Nítido, tono de locutor",
    },
    // Thiago - Measured Professional
    "Telnyx.Ultra.21c2f7ab-dacb-4847-a593-3cd20668c4b3": {
      descripcion: "Sobrio y profesional",
    },
  },
  "en-GB": {
    // Mujeres
    // Lucy - Capable Coordinator
    "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01": {
      descripcion: "Tranquilizadora, de atención al cliente",
      recomendada: true,
    },
    // Cora - Service Specialist
    "Telnyx.Ultra.c46cf1f6-49a1-4d67-9a57-ff859a4046d3": {
      descripcion: "Servicial y articulada",
      recomendada: true,
    },
    // Victoria - Refined Coordinator
    "Telnyx.Ultra.dc30854e-e398-4579-9dc8-16f6cb2c19b9": {
      descripcion: "Nítida y profesional",
      recomendada: true,
    },
    // Imogen - Polished Guide
    "Telnyx.Ultra.5a93ae96-9e3e-4b9d-8575-5f62b7de6d0f": {
      descripcion: "Pulida y serena",
      recomendada: true,
    },
    // Ailsa - Warm Guide
    "Telnyx.Ultra.fb02b554-7d64-4f90-841e-e57fc88f410c": {
      descripcion: "Tranquila y cercana",
    },
    // Charlotte - Heiress
    "Telnyx.Ultra.71a7ad14-091c-4e8e-a314-022ece01c121": {
      descripcion: "Elegante y joven",
    },
    // Courtney - Composed Professional
    "Telnyx.Ultra.16a4052e-1f11-47ac-95f5-9330bee062f9": {
      descripcion: "Cálida y mesurada",
    },
    // Evelyn - Digital Assistante
    "Telnyx.Ultra.3c7dfd17-3fa8-47aa-aacc-6313fe025442": {
      descripcion: "Neutra, de asistente digital",
    },
    // Evie - Engaging Expert
    "Telnyx.Ultra.e5d4c33a-d8f6-46e8-a10f-b5afecc35648": {
      descripcion: "Formal y corporativa",
    },
    // Fiona - Witty Woman
    "Telnyx.Ultra.a01c369f-6d2d-4185-bc20-b32c225eab70": {
      descripcion: "Alegre y enérgica",
    },
    // Gemma - Decisive Agent
    "Telnyx.Ultra.62ae83ad-4f6a-430b-af41-a9bede9286ca": {
      descripcion: "Segura y expresiva",
    },
    // Julia - Gentle Guide
    "Telnyx.Ultra.273f9ef7-9fc2-4def-88bb-ab108c6249ca": {
      descripcion: "Suave y delicada",
    },
    // Pippa - Bright Assistant
    "Telnyx.Ultra.81cd8d19-45e7-47b2-ad0e-bcd94f557ad0": {
      descripcion: "Alegre y servicial",
    },
    // Saira - Organized Coordinator
    "Telnyx.Ultra.1e9b9b3d-d2ce-4cac-9d05-bc36a63fa28e": {
      descripcion: "Cálida y atenta",
    },
    // Hombres
    // George - Composed Consultant
    "Telnyx.Ultra.4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991": {
      descripcion: "Sereno y resolutivo",
      recomendada: true,
    },
    // Oliver - Customer Chap
    "Telnyx.Ultra.ee7ea9f8-c0c1-498c-9279-764d6b56d189": {
      descripcion: "Educado y joven",
      recomendada: true,
    },
    // Harrison - Diligent Detailer
    "Telnyx.Ultra.df89f42f-f285-4613-adbf-14eedcec4c9e": {
      descripcion: "Nítido y eficiente",
      recomendada: true,
    },
    // Alistair - Composed Consultant
    "Telnyx.Ultra.c8f7835e-28a3-4f0c-80d7-c1302ac62aae": {
      descripcion: "Sofisticado y sereno",
      recomendada: true,
    },
    // Alec - Spirited Salesman
    "Telnyx.Ultra.17044048-bfab-44b2-9532-9c1b65e9c217": {
      descripcion: "Animado y cálido",
    },
    // Alfie - Composed Advisor
    "Telnyx.Ultra.5e7d492a-5502-482e-b315-ebf587427806": {
      descripcion: "Calmado y equilibrado",
    },
    // Archie - Approachable Mate
    "Telnyx.Ultra.ef191366-f52f-447a-a398-ed8c0f2943a1": {
      descripcion: "Cercano e informal",
    },
    // Arthur - Polished Advisor
    "Telnyx.Ultra.bb7e8daa-8b79-47a2-8408-a7a1cc72b53c": {
      descripcion: "Refinado y seguro",
    },
    // Benedict - Measured Mediator
    "Telnyx.Ultra.3c0f09d6-e0d7-499c-a594-70c5b7b93048": {
      descripcion: "Pulido y formal",
    },
    // Benedict - Royal Narrator
    "Telnyx.Ultra.7cf0e2b1-8daf-4fe4-89ad-f6039398f359": {
      nombre: "Benedict (narrador)",
      descripcion: "Firme y seguro",
    },
    // Casper - Gentle Narrator
    "Telnyx.Ultra.4f7f1324-1853-48a6-b294-4e78e8036a83": {
      descripcion: "Joven y melancólico",
    },
    // Clive - Measured Expert
    "Telnyx.Ultra.b24f41fd-00a3-4cd8-992a-a0c9f13f3ef1": {
      descripcion: "Sereno y articulado",
    },
    // Finn - Engaging Host
    "Telnyx.Ultra.15070120-82ab-48e5-87e5-c4bf28fa4bf9": {
      descripcion: "Alegre y amable",
    },
    // Gary - Composed Advisor
    "Telnyx.Ultra.dc52ada6-0e11-4684-a8fa-e0af5b7bdcb2": {
      descripcion: "Directo y mesurado",
    },
    // Griffin - Narrator
    "Telnyx.Ultra.c99d36f3-5ffd-4253-803a-535c1bc9c306": {
      descripcion: "Voz mayor de narrador",
    },
    // Hugo - Teatime Friend
    "Telnyx.Ultra.1463a4e1-56a1-4b41-b257-728d56e93605": {
      descripcion: "Joven y expresivo",
    },
    // Jasper - Service Specialist
    "Telnyx.Ultra.3faa81ae-d3d8-4ab1-9e44-e50e46d33c30": {
      descripcion: "Cálido y expresivo",
    },
    // Martin - Meticulous Operator
    "Telnyx.Ultra.dcddf1f4-b114-4b5d-9158-895cbba0e406": {
      descripcion: "Maduro y meticuloso",
    },
    // Miles - Yogi
    "Telnyx.Ultra.f114a467-c40a-4db8-964d-aaba89cd08fa": {
      descripcion: "Grave y relajante",
    },
    // Oscar - Clear Specialist
    "Telnyx.Ultra.22df7143-7987-4e15-a720-d65c69a443b3": {
      descripcion: "Profesional y enérgico",
    },
    // Owen - Support Anchor
    "Telnyx.Ultra.0ea47942-be0b-4bc7-a1bf-5dba008dc1cc": {
      descripcion: "Preciso y eficiente",
    },
    // Quentin - Refined Narrator
    "Telnyx.Ultra.5568a7df-e5ab-4442-9fae-2e9ba1b15ad8": {
      descripcion: "Refinado y pausado",
    },
    // Rowan - Steady Guide
    "Telnyx.Ultra.8c254787-4eb4-4577-bd3d-fb3c273baea2": {
      descripcion: "Firme y fiable",
    },
    // Roy - Stern Realist
    "Telnyx.Ultra.f2ddbdca-59d9-4363-abeb-a197d65ea24a": {
      descripcion: "Serio y experimentado",
    },
    // Rupert - Caring Dad
    "Telnyx.Ultra.0ad65e7f-006c-47cf-bd31-52279d487913": {
      descripcion: "Cálido y paternal",
    },
    // Toby - Genuine Guide
    "Telnyx.Ultra.3d5ce2fb-e56c-42f0-9ed9-4662484063b4": {
      descripcion: "Cálido y conversador",
    },
  },
  "fr-FR": {
    // Mujeres
    // Léa - Logical Liaison
    "Telnyx.Ultra.c96a7d7d-3457-4979-8665-522f7b3e36fb": {
      descripcion: "Metódica y precisa",
      recomendada: true,
    },
    // Eloise - Dialogue Anchor
    "Telnyx.Ultra.6c64b57a-bc65-48e4-bff4-12dbe85606cd": {
      descripcion: "Clara y cálida",
      recomendada: true,
    },
    // Solène - Customer Champion
    "Telnyx.Ultra.c9f95851-235c-458c-acfb-67cdb2558538": {
      descripcion: "Servicial y segura",
      recomendada: true,
    },
    // Amélie - Decisive Agent
    "Telnyx.Ultra.faa75703-00e3-4a57-9955-0703001e3231": {
      descripcion: "Pulida y resolutiva",
      recomendada: true,
    },
    // Elise - Information Steward
    "Telnyx.Ultra.d6f67b55-1fec-4319-8949-32ec9fa863c9": {
      nombre: "Elise (informadora)",
      descripcion: "Serena y atenta",
    },
    // Emmanuelle
    "Telnyx.Ultra.735287ee-ce91-4b08-8de4-63315c5ba1fb": {
      descripcion: "Enérgica y alegre",
    },
    // Inaya - Reassuring Support
    "Telnyx.Ultra.5f83e88f-9b5a-4563-95c4-904f4b0036e9": {
      descripcion: "Calmada y empática",
    },
    // Inès - Poised Communicator
    "Telnyx.Ultra.7c58f4a4-a72c-42fa-a503-41b9408820f3": {
      descripcion: "Segura y articulada",
    },
    // Jade - Steady Companion
    "Telnyx.Ultra.92579402-6868-412e-b845-3efed0be7a9e": {
      descripcion: "Serena y precisa",
    },
    // Juliette
    "Telnyx.Ultra.c9115185-0086-4cf4-bfdd-0d36425db387": {
      descripcion: "Joven y animada",
    },
    // Louise - Tone Anchor
    "Telnyx.Ultra.e70cceed-576e-4fc1-9fc1-f1e137f15367": {
      descripcion: "Metódica y cercana",
    },
    // Manon - Bright Belle
    "Telnyx.Ultra.2f8e82c4-cb94-4e6d-8b6a-29bf58ceb60a": {
      descripcion: "Joven y alegre",
    },
    // Maëlle B - Care Desk
    "Telnyx.Ultra.80f117a5-5196-4b64-8b4c-efda3d3ab176": {
      nombre: "Maëlle",
      descripcion: "Mesurada y empática",
    },
    // Pauline - Helpful Companion
    "Telnyx.Ultra.65b25c5d-ff07-4687-a04c-da2f43ef6fa9": {
      descripcion: "Alegre, como una amiga",
    },
    // Valérie - Vibrant Voice
    "Telnyx.Ultra.0d09e991-5763-406e-b637-02bc431ef72d": {
      descripcion: "Vibrante y enérgica",
    },
    // Zoé - Informative Dispatcher
    "Telnyx.Ultra.b56a7171-86f0-42b6-b3fa-a316794aa4e0": {
      descripcion: "Clara y puntual",
    },
    // Élise - Efficient Liaison
    "Telnyx.Ultra.658607d6-26cd-4ab5-8a36-d964ee4b1051": {
      descripcion: "Ágil y eficaz",
    },
    // Hombres
    // Laurent - Dependable Anchor
    "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4": {
      descripcion: "Firme y corporativo",
      recomendada: true,
    },
    // Benoît - Methodical Moderator
    "Telnyx.Ultra.5def377d-908b-4540-8bd7-3c968fcae351": {
      descripcion: "Claro y metódico",
      recomendada: true,
    },
    // Maxime - Methodical Moderator
    "Telnyx.Ultra.cc7d2711-69af-4072-9674-df588dd85682": {
      descripcion: "Calmado y resolutivo",
      recomendada: true,
    },
    // Antoine - Stern Man
    "Telnyx.Ultra.0418348a-0ca2-4e90-9986-800fb8b3bbc0": {
      descripcion: "Claro y suave",
      recomendada: true,
    },
    // Dorian - Supportive Analyst
    "Telnyx.Ultra.57c90262-e4a1-4496-b256-98e3a92d8d82": {
      descripcion: "Organizado y tranquilizador",
    },
    // Erwan - Everyday Speaker
    "Telnyx.Ultra.ab636c8b-9960-4fb3-bb0c-b7b655fb9745": {
      descripcion: "Claro y constante",
    },
    // Gerard
    "Telnyx.Ultra.5deeaea9-c3cf-4288-82ec-22d8f04eb158": {
      descripcion: "Grave y con autoridad",
    },
    // Jules - Polished Host
    "Telnyx.Ultra.8f1e9d27-96ff-405e-9213-7432a784ac0b": {
      descripcion: "Pulido y seguro",
    },
    // Leo
    "Telnyx.Ultra.adff5dcb-249f-463f-aa89-d98d8ca05e88": {
      descripcion: "Enérgico y motivador",
    },
    // Louis - Methodical Inquirer
    "Telnyx.Ultra.004e0148-b251-48ae-b77a-234fbb5e2099": {
      descripcion: "Calmado y analítico",
    },
    // Mathieu - Assured Expert
    "Telnyx.Ultra.93c98a2b-7d15-4f7b-8236-294b1e02b1c0": {
      descripcion: "Seguro y experto",
    },
    // Mathis - Analytical Explanator
    "Telnyx.Ultra.996ec149-0dca-4389-ad08-e2d6f906b4bf": {
      descripcion: "Reflexivo y mesurado",
    },
    // Nolan - Solution Planner
    "Telnyx.Ultra.78291f16-fc9b-4f72-a21b-1ac7d767d104": {
      descripcion: "Metódico y fiable",
    },
    // Pierre
    "Telnyx.Ultra.bfd5390b-e4f9-4e44-95ab-9ebd223acd62": {
      descripcion: "Profesional y tranquilo",
    },
    // Vincent
    "Telnyx.Ultra.80e11491-2d8a-4361-ac61-c4f3e0a4f7e7": {
      descripcion: "Enérgico y animado",
    },
    // Younes - Clear Helper
    "Telnyx.Ultra.fbc431c6-7d79-4ef5-b1bb-aab9f579c690": {
      descripcion: "Claro y tranquilizador",
    },
  },
  "de-DE": {
    // Mujeres
    // Alina - Engaging Assistant
    "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06": {
      descripcion: "Cálida, de atención telefónica",
      recomendada: true,
    },
    // Emi
    "Telnyx.Ultra.43a317e9-f1b9-45bf-bbdb-1d4a52e46f0d": {
      descripcion: "Tranquila y neutra",
      recomendada: true,
    },
    // Viktoria - Phone Conversationalist
    "Telnyx.Ultra.b9de4a89-2257-424b-94c2-db18ba68c81a": {
      descripcion: "Clara y suave",
      recomendada: true,
    },
    // Sibylle
    "Telnyx.Ultra.b629d743-2b5a-4ffd-b5bb-9de9b969a690": {
      descripcion: "Clara y segura",
      recomendada: true,
    },
    // Eleni - Troubleshooter
    "Telnyx.Ultra.c0c52199-e35f-4681-b68a-949ee499617e": {
      descripcion: "Cercana, acento suizo",
    },
    // Jennifer
    "Telnyx.Ultra.ac197a78-cec7-4c50-93e5-93bdc1910b11": {
      descripcion: "Cercana y conversadora",
    },
    // Karin - Companion
    "Telnyx.Ultra.3f4ade23-6eb4-4279-ab05-6a144947c4d5": {
      descripcion: "Amable e informal",
    },
    // Klara - Empathetic Voice
    "Telnyx.Ultra.2578354e-4b18-4d28-832c-5943344b7085": {
      descripcion: "Dulce y tranquilizadora",
    },
    // Lea - Breezy Voice
    "Telnyx.Ultra.1ade29fc-6b82-4607-9e70-361720139b12": {
      descripcion: "Suave e informal",
    },
    // Lena - Muse
    "Telnyx.Ultra.4ab1ff51-476d-42bb-8019-4d315f7c0c05": {
      descripcion: "Sobria y clara",
    },
    // Leni - Daymaker
    "Telnyx.Ultra.adc919b3-6ebf-47fd-8a46-27c5169d6d94": {
      descripcion: "Alegre y entusiasta",
    },
    // Lorelei - Helpful Guide
    "Telnyx.Ultra.0b66a153-548f-4f2c-b734-09a13b0bd163": {
      descripcion: "Calmada y bien articulada",
    },
    // Marlene - Elegant Speaker
    "Telnyx.Ultra.9b4d08b6-0494-4301-ab92-9150f4ee2718": {
      descripcion: "Elegante y formal",
    },
    // Rena
    "Telnyx.Ultra.de07efe3-b309-418b-bdca-42827223efd2": {
      descripcion: "Joven y expresiva",
    },
    // Sabine - Firm Newscaster
    "Telnyx.Ultra.6d4b1416-8d54-4d94-a788-8a802c086544": {
      descripcion: "Suave pero firme",
    },
    // Vreni - Diligent Advisor
    "Telnyx.Ultra.40e0f496-a220-46bb-975a-7ef465b3d92b": {
      descripcion: "Serena, acento suizo",
    },
    // Hombres
    // Lukas - Professional
    "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954": {
      descripcion: "Seguro, de atención telefónica",
      recomendada: true,
    },
    // Thomas - Anchor
    "Telnyx.Ultra.384b625b-da5d-49e8-a76d-a2855d4f31eb": {
      descripcion: "Formal y sincero",
      recomendada: true,
    },
    // Hermann - Businessman
    "Telnyx.Ultra.f6f315e4-4fb3-4440-92ea-2edb01f9bf1b": {
      descripcion: "Cálido y seguro",
      recomendada: true,
    },
    // Nico - Friendly Agent
    "Telnyx.Ultra.afa425cf-5489-4a09-8a3f-d3cb1f82150d": {
      descripcion: "Desenfadado y cercano",
      recomendada: true,
    },
    // Alexander - Reliable Advisor
    "Telnyx.Ultra.cd7b67f4-22a4-49a0-a197-3fa16f7e64d4": {
      descripcion: "Firme y fiable",
    },
    // Andreas - Recorder
    "Telnyx.Ultra.db229dfe-f5de-4be4-91fd-7b077c158578": {
      descripcion: "Suave, de narrador",
    },
    // Christian
    "Telnyx.Ultra.3264ada2-4a79-4666-badc-49e2267be692": {
      descripcion: "Enérgico y expresivo",
    },
    // Clemens - Precise Instructor
    "Telnyx.Ultra.57a3a9e0-a91c-4c94-a2bb-e6cbab3ae649": {
      descripcion: "Claro y preciso",
    },
    // Dieter - Commercial Man
    "Telnyx.Ultra.2be00b67-d53f-4eb5-89e7-96c224d56fbc": {
      descripcion: "Potente y expresivo",
    },
    // Henrik - Steady Analyst
    "Telnyx.Ultra.d1cbea67-e4d3-47cd-be2a-2bd4e646b002": {
      descripcion: "Articulado y fiable",
    },
    // Jan
    "Telnyx.Ultra.42f14755-88c3-4124-aae3-5cc3a9618e8f": {
      descripcion: "Claro y didáctico",
    },
    // Jonas
    "Telnyx.Ultra.dff81230-ff75-49a4-af44-f6b2f43500d8": {
      descripcion: "Cálido e informal",
    },
    // Klaus - Archivist
    "Telnyx.Ultra.24c61c42-b538-468e-a9ad-16c7a032c9cb": {
      descripcion: "Grave y sereno",
    },
    // Leander
    "Telnyx.Ultra.758a5cff-af0b-4bdf-84bd-4c1b5525c249": {
      descripcion: "Cálido y cercano",
    },
    // Moritz - Modern Communicator
    "Telnyx.Ultra.4ad22058-7cb6-402c-a115-196cbfc25dce": {
      descripcion: "Nítido y moderno",
    },
    // Oskar - Steady Advisor
    "Telnyx.Ultra.d42fc8d7-efdd-44df-bb2e-a6e093601917": {
      descripcion: "Experimentado y sereno",
    },
    // Sebastian - Orator
    "Telnyx.Ultra.b7187e84-fe22-4344-ba4a-bc013fcb533e": {
      descripcion: "Cálido y claro",
    },
  },
  "it-IT": {
    // Mujeres
    // Sofia - Methodical Moderator
    "Telnyx.Ultra.90c7d657-9599-4cd0-9ed2-2568359e4d1a": {
      descripcion: "Pulida y eficiente",
      recomendada: true,
    },
    // Elena - Client Liaison
    "Telnyx.Ultra.00e9ec78-2002-41dd-8d19-6b1d3b17a461": {
      descripcion: "Serena y articulada",
      recomendada: true,
    },
    // Alessandra - Melodic Guide
    "Telnyx.Ultra.0e21713a-5e9a-428a-bed4-90d410b87f13": {
      descripcion: "Elegante y melodiosa",
      recomendada: true,
    },
    // Francesca - Elegant Partner
    "Telnyx.Ultra.d609f27f-f1a4-410f-85bb-10037b4fba99": {
      descripcion: "Natural y clara",
    },
    // Giulia - Teacherly Voice
    "Telnyx.Ultra.36d94908-c5b9-4014-b521-e69aee5bead0": {
      descripcion: "Firme, de profesora",
    },
    // Liv - Casual Friend
    "Telnyx.Ultra.d718e944-b313-4998-b011-d1cc078d4ef3": {
      descripcion: "Desenfadada y natural",
    },
    // Hombres
    // Marco - Friendly Conversationalist
    "Telnyx.Ultra.79693aee-1207-4771-a01e-20c393c89e6f": {
      descripcion: "Amable y profesional",
      recomendada: true,
    },
    // Giancarlo - Support Leader
    "Telnyx.Ultra.029c3c7a-b6d9-44f0-814b-200d849830ff": {
      descripcion: "Grave y cercano",
      recomendada: true,
    },
    // Alessio - Clear Anchor
    "Telnyx.Ultra.c8403b5c-6465-4396-9065-a440d376528a": {
      descripcion: "Calmado y preciso",
      recomendada: true,
    },
    // Lorenzo - Hospitable Host
    "Telnyx.Ultra.ee16f140-f6dc-490e-a1ed-c1d537ea0086": {
      descripcion: "Cercano y hospitalario",
      recomendada: true,
    },
    // Fabio - Logistics Expert
    "Telnyx.Ultra.526ab945-9cbf-4bd2-9c72-3833d55d4c68": {
      descripcion: "Sereno y articulado",
    },
    // Luca - Everyday Friend
    "Telnyx.Ultra.e019ed7e-6079-4467-bc7f-b599a5dccf6f": {
      descripcion: "Desenfadado y natural",
    },
    // Matteo - Gentle Narrator
    "Telnyx.Ultra.408daed0-c597-4c27-aae8-fa0497d644bf": {
      descripcion: "Tranquilizador y suave",
    },
  },
  "pt-PT": {
    // Mujeres
    // Beatriz - Support Guide
    "Telnyx.Ultra.d4b44b9a-82bc-4b65-b456-763fce4c52f9": {
      descripcion: "Amable y natural",
      recomendada: true,
    },
    // Isabel - Confident Woman
    "Telnyx.Ultra.f39bf583-3b3d-402f-9ffb-6179d9ec3e35": {
      descripcion: "Segura y clara",
      recomendada: true,
    },
    // Hombres
    // Paulo - Transfer Desk
    "Telnyx.Ultra.250fdc17-cc1b-4ff1-8538-63988791cd3e": {
      descripcion: "Cálido y eficiente",
      recomendada: true,
    },
    // Gaspar - Considerate Listener
    "Telnyx.Ultra.e6b8bb73-2655-433d-8a10-7b8cf559d03b": {
      descripcion: "Empático y comprensivo",
      recomendada: true,
    },
    // Matias - Process Explainer
    "Telnyx.Ultra.b1d18488-4aaa-47e7-9e4b-483c90a67968": {
      descripcion: "Claro y didáctico",
      recomendada: true,
    },
    // Diogo - Promotion Lead
    "Telnyx.Ultra.fbee0e7d-a83a-4082-bad1-13c70f86da4e": {
      descripcion: "Potente y persuasivo",
    },
    // Tiago - Narration Expert
    "Telnyx.Ultra.6a360542-a117-4ed5-9e09-e8bf9b05eabb": {
      descripcion: "Calmado, de narrador",
    },
  },
  "nl-NL": {
    // Mujeres
    // Anneliese - Methodical Guide
    "Telnyx.Ultra.225ba8cf-9fc2-4371-a78c-fe38ba38898a": {
      descripcion: "Clara y eficiente",
      recomendada: true,
    },
    // Noa - Reassuring Responder
    "Telnyx.Ultra.96355f3d-0179-4c9a-a8d8-11ef0779a9b8": {
      descripcion: "Suave y empática",
      recomendada: true,
    },
    // Isa - Empathetic Ear
    "Telnyx.Ultra.60e94cf5-8069-459f-a91e-3ff852a51107": {
      descripcion: "Cálida y expresiva",
      recomendada: true,
    },
    // Fleur - Vibrant Voice
    "Telnyx.Ultra.de075c71-b2dd-4723-848d-ea9aa9cd010b": {
      descripcion: "Joven y animada",
      recomendada: true,
    },
    // Anneke - Trusted Guide
    "Telnyx.Ultra.ac317dac-1b8f-434f-b198-a490e2a4914d": {
      descripcion: "Suave y cariñosa",
    },
    // Femke - Global Host
    "Telnyx.Ultra.4fbae271-89c4-494d-8181-6eddca393453": {
      descripcion: "Centrada y constante",
    },
    // Sanne - Clear Companion
    "Telnyx.Ultra.0eb213fe-4658-45bc-9442-33a48b24b133": {
      descripcion: "Alegre y conversadora",
    },
    // Hombres
    // Stijn - Helpful Handler
    "Telnyx.Ultra.da743a82-ddf2-4d9b-8eb8-ff67ca0b138e": {
      descripcion: "Cercano y profesional",
      recomendada: true,
    },
    // Thijs - Confident Coordinator
    "Telnyx.Ultra.95e9fdaf-cf0b-4739-b1de-3350ca50774a": {
      descripcion: "Claro y metódico",
      recomendada: true,
    },
    // Jeroen - Clear Storyteller
    "Telnyx.Ultra.4b250449-c635-4b63-bd1d-b654b12ffcd4": {
      descripcion: "Claro y firme",
    },
    // Lucas - Storyteller
    "Telnyx.Ultra.af482421-80f4-4379-b00c-a118def29cde": {
      descripcion: "Articulado, de narrador",
    },
  },
};

/** Por idioma, las voces vigentes que no se ofrecen, por id, con su motivo. */
export const EXCLUSIONES_DE_VOCES: PorIdiomaUltra<PorIdDeVoz<string>> = {
  "es-ES": {},
  "en-GB": {
    // Caspian - Oracle
    "Telnyx.Ultra.d7862948-75c3-4c7c-ae28-2959fe166f49":
      "Efecto de eco (personaje místico): sonaría roto en una recepción.",
    // Trevor - Movieman
    "Telnyx.Ultra.c45bc5ec-dc68-4feb-8829-6e6b2748095d":
      "Personaje de tráiler de cine: no suena a recepcionista.",
    // Griffin - Excited Narrator
    "Telnyx.Ultra.34d923aa-c3b5-4f21-aac7-2c1f12730d4b":
      "Duplicado de «Griffin - Narrator»: mismo nombre y misma etiqueta.",
  },
  "fr-FR": {
    // Gerard - Monsieur Noir
    "Telnyx.Ultra.2d693a9c-fc75-4313-aefb-c9cfaa17dd83":
      "Duplicado de «Gerard»: mismo nombre y misma etiqueta.",
    // Las genéricas sin nombre de pila son de una serie que Telnyx ya ha
    // deprecado en los demás idiomas (British Lady, German Reporter Woman,
    // Friendly German Man, Dutch Narrator Lady…).
    // French Narrator Lady
    "Telnyx.Ultra.8832a0b5-47b2-4751-bb22-6a8e2149303d":
      "Genérica y sin nombre de pila: su serie ya está deprecada.",
    // French Narrator Man
    "Telnyx.Ultra.5c3c89e5-535f-43ef-b14d-f8ffe148c1f0":
      "Genérica y sin nombre de pila: su serie ya está deprecada.",
    // Friendly French Man
    "Telnyx.Ultra.ab7c61f5-3daa-47dd-a23b-4ac0aac5f5c3":
      "Genérica y sin nombre de pila: Friendly German Man ya está deprecada.",
  },
  "de-DE": {},
  "it-IT": {
    // Giuseppe - Retro Man
    "Telnyx.Ultra.88b329db-85d7-47cc-a5c5-98225a756721":
      "Efecto de radio antigua: sonaría roto en una recepción.",
  },
  "pt-PT": {},
  "nl-NL": {},
};
