/**
 * Voces Ultra que el negocio puede elegir, por idioma de saludo.
 *
 * GENERADO por scripts/generarVocesUltra.ts con la lista de la API de
 * Telnyx y la curación a mano (curacionDeVoces.ts). No editar a mano:
 * cambia la curación y vuelve a generarlo.
 *
 * Por género (mujeres primero); en cada uno, la de por defecto, luego
 * las recomendadas y luego el resto, estas dos por nombre.
 */
import type { GeneroDeVoz } from "./catalogo.js";
import type { PorIdiomaUltra } from "./curacionDeVoces.js";

export interface VozUltra {
  /** `Telnyx.Ultra.<uuid>`, tal cual va en `voice_settings.voice`. */
  id: string;
  /** Nombre visible, único dentro de su idioma. */
  nombre: string;
  genero: GeneroDeVoz;
  /** Cómo suena, en español (2–5 palabras). */
  descripcion: string;
  /** De atención al cliente: el panel la enseña sin desplegar. */
  recomendada: boolean;
}

export const VOCES_ULTRA: PorIdiomaUltra<readonly VozUltra[]> = {
  // 29 voces: 18 mujeres (6 recomendadas), 11 hombres (6 recomendadas)
  "es-ES": [
    // Blanca - Graceful Host
    {
      id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      nombre: "Blanca",
      genero: "femenina",
      descripcion: "Cálida y acogedora",
      recomendada: true,
    },
    // Alicia - Walkthrough Guide
    {
      id: "Telnyx.Ultra.5522c839-bbd9-4485-8d84-ba3d75cd3330",
      nombre: "Alicia",
      genero: "femenina",
      descripcion: "Tranquila y reconfortante",
      recomendada: true,
    },
    // Eva - Service Expert
    {
      id: "Telnyx.Ultra.23da166b-9675-425a-a56f-10d92da2e35f",
      nombre: "Eva",
      genero: "femenina",
      descripcion: "Profesional y serena",
      recomendada: true,
    },
    // Lara - Customer Liaison
    {
      id: "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6",
      nombre: "Lara",
      genero: "femenina",
      descripcion: "Atenta y clara",
      recomendada: true,
    },
    // Marta - Friendly Guide
    {
      id: "Telnyx.Ultra.de38f545-c574-44e8-9b54-a7d6fec1c6b1",
      nombre: "Marta",
      genero: "femenina",
      descripcion: "Cercana, de atención al cliente",
      recomendada: true,
    },
    // Nuria - Trusted Advisor
    {
      id: "Telnyx.Ultra.9d8c6b2e-0a23-4a15-ae1b-121d5b5af417",
      nombre: "Nuria",
      genero: "femenina",
      descripcion: "Serena y de confianza",
      recomendada: true,
    },
    // Ainsley - Training Host
    {
      id: "Telnyx.Ultra.d6032980-a170-4fdc-adfc-aabc93db0ae4",
      nombre: "Ainsley",
      genero: "femenina",
      descripcion: "Acogedora y precisa",
      recomendada: false,
    },
    // Alondra - Reassuring Sister
    {
      id: "Telnyx.Ultra.ccfea4bf-b3f4-421e-87ed-dd05dae01431",
      nombre: "Alondra",
      genero: "femenina",
      descripcion: "Cálida y protectora",
      recomendada: false,
    },
    // Celia - Practical Analyst
    {
      id: "Telnyx.Ultra.ad38904c-0ce9-42b1-9159-5ad5352ef089",
      nombre: "Celia",
      genero: "femenina",
      descripcion: "Reflexiva y práctica",
      recomendada: false,
    },
    // Elena - Narrator
    {
      id: "Telnyx.Ultra.cefcb124-080b-4655-b31f-932f3ee743de",
      nombre: "Elena",
      genero: "femenina",
      descripcion: "Suave y pausada",
      recomendada: false,
    },
    // Flor - Hold Companion
    {
      id: "Telnyx.Ultra.b8f073cd-cb60-43ef-aa01-feb59a8b7394",
      nombre: "Flor",
      genero: "femenina",
      descripcion: "Clara y cálida",
      recomendada: false,
    },
    // Ines - Route Guide
    {
      id: "Telnyx.Ultra.db74bd0c-9ea6-4d08-b78e-c3c0a54dfd2d",
      nombre: "Inés",
      genero: "femenina",
      descripcion: "Natural y desenvuelta",
      recomendada: false,
    },
    // Iria - Thoughtful Communicator
    {
      id: "Telnyx.Ultra.a7beff01-8f8b-4809-bfe6-e2166e57e0c2",
      nombre: "Iria",
      genero: "femenina",
      descripcion: "Pausada y reflexiva",
      recomendada: false,
    },
    // Isabel - Teacher
    {
      id: "Telnyx.Ultra.c0c374aa-09be-42d9-9828-4d2d7df86962",
      nombre: "Isabel",
      genero: "femenina",
      descripcion: "Cercana, tono de profesora",
      recomendada: false,
    },
    // Lucia - Radiant Host
    {
      id: "Telnyx.Ultra.c0925108-d541-4dc4-bbae-39f4e57ba10c",
      nombre: "Lucía",
      genero: "femenina",
      descripcion: "Brillante y acogedora",
      recomendada: false,
    },
    // Noa - Professional Assistant
    {
      id: "Telnyx.Ultra.3408d527-179f-434a-94cb-962d5578642d",
      nombre: "Noa",
      genero: "femenina",
      descripcion: "Pulida y resolutiva",
      recomendada: false,
    },
    // Paloma - Clear Presenter Woman
    {
      id: "Telnyx.Ultra.d4db5fb9-f44b-4bd1-85fa-192e0f0d75f9",
      nombre: "Paloma",
      genero: "femenina",
      descripcion: "Clara y profesional",
      recomendada: false,
    },
    // Renata - Cheerful Conversationalist
    {
      id: "Telnyx.Ultra.d3793b7b-4996-409c-9d59-96dd09f47717",
      nombre: "Renata",
      genero: "femenina",
      descripcion: "Animada, voz madura",
      recomendada: false,
    },
    // Marcos - Steady Advisor
    {
      id: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
      nombre: "Marcos",
      genero: "masculina",
      descripcion: "Sereno y profesional",
      recomendada: true,
    },
    // Álvaro - Steady Explainer
    {
      id: "Telnyx.Ultra.ca526927-b7c8-4a64-95d7-235d30b7771f",
      nombre: "Álvaro",
      genero: "masculina",
      descripcion: "Claro y equilibrado",
      recomendada: true,
    },
    // Darío - Steady Operator
    {
      id: "Telnyx.Ultra.35b2cfc1-e6fb-4d69-a598-c1780612be4a",
      nombre: "Darío",
      genero: "masculina",
      descripcion: "Seguro y sereno",
      recomendada: true,
    },
    // Miguel - Route Guide
    {
      id: "Telnyx.Ultra.d813d699-27f0-4231-83b4-6bd1bce106ba",
      nombre: "Miguel",
      genero: "masculina",
      descripcion: "Suave y articulado",
      recomendada: true,
    },
    // Octavio - Service Anchor
    {
      id: "Telnyx.Ultra.9aea78cb-ba89-4a82-aa15-31b55a89b75d",
      nombre: "Octavio",
      genero: "masculina",
      descripcion: "Natural y profesional",
      recomendada: true,
    },
    // Rafael - Poised Advisor
    {
      id: "Telnyx.Ultra.cbb6fdf0-30dd-49f6-af7d-bbb1185c1fa5",
      nombre: "Rafael",
      genero: "masculina",
      descripcion: "Calmado y con autoridad",
      recomendada: true,
    },
    // Benito - Digital Voice
    {
      id: "Telnyx.Ultra.02aeee94-c02b-456e-be7a-659672acf82d",
      nombre: "Benito",
      genero: "masculina",
      descripcion: "Claro y constante",
      recomendada: false,
    },
    // Gonzalo - Grounded Storyteller
    {
      id: "Telnyx.Ultra.58e531e3-b212-49df-adee-c335a19c2429",
      nombre: "Gonzalo",
      genero: "masculina",
      descripcion: "Cálido y auténtico",
      recomendada: false,
    },
    // Hector - Tour Leader
    {
      id: "Telnyx.Ultra.b042270c-d46f-4d4f-8fb0-7dd7c5fe5615",
      nombre: "Héctor",
      genero: "masculina",
      descripcion: "Enérgico y cautivador",
      recomendada: false,
    },
    // Luis - News Caster
    {
      id: "Telnyx.Ultra.b5aa8098-49ef-475d-89b0-c9262ecf33fd",
      nombre: "Luis",
      genero: "masculina",
      descripcion: "Nítido, tono de locutor",
      recomendada: false,
    },
    // Thiago - Measured Professional
    {
      id: "Telnyx.Ultra.21c2f7ab-dacb-4847-a593-3cd20668c4b3",
      nombre: "Thiago",
      genero: "masculina",
      descripcion: "Sobrio y profesional",
      recomendada: false,
    },
  ],
  // 40 voces: 14 mujeres (4 recomendadas), 26 hombres (4 recomendadas)
  "en-GB": [
    // Lucy - Capable Coordinator
    {
      id: "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01",
      nombre: "Lucy",
      genero: "femenina",
      descripcion: "Tranquilizadora, de atención al cliente",
      recomendada: true,
    },
    // Cora - Service Specialist
    {
      id: "Telnyx.Ultra.c46cf1f6-49a1-4d67-9a57-ff859a4046d3",
      nombre: "Cora",
      genero: "femenina",
      descripcion: "Servicial y articulada",
      recomendada: true,
    },
    // Imogen - Polished Guide
    {
      id: "Telnyx.Ultra.5a93ae96-9e3e-4b9d-8575-5f62b7de6d0f",
      nombre: "Imogen",
      genero: "femenina",
      descripcion: "Pulida y serena",
      recomendada: true,
    },
    // Victoria - Refined Coordinator
    {
      id: "Telnyx.Ultra.dc30854e-e398-4579-9dc8-16f6cb2c19b9",
      nombre: "Victoria",
      genero: "femenina",
      descripcion: "Nítida y profesional",
      recomendada: true,
    },
    // Ailsa - Warm Guide
    {
      id: "Telnyx.Ultra.fb02b554-7d64-4f90-841e-e57fc88f410c",
      nombre: "Ailsa",
      genero: "femenina",
      descripcion: "Tranquila y cercana",
      recomendada: false,
    },
    // Charlotte - Heiress
    {
      id: "Telnyx.Ultra.71a7ad14-091c-4e8e-a314-022ece01c121",
      nombre: "Charlotte",
      genero: "femenina",
      descripcion: "Elegante y joven",
      recomendada: false,
    },
    // Courtney - Composed Professional
    {
      id: "Telnyx.Ultra.16a4052e-1f11-47ac-95f5-9330bee062f9",
      nombre: "Courtney",
      genero: "femenina",
      descripcion: "Cálida y mesurada",
      recomendada: false,
    },
    // Evelyn - Digital Assistante
    {
      id: "Telnyx.Ultra.3c7dfd17-3fa8-47aa-aacc-6313fe025442",
      nombre: "Evelyn",
      genero: "femenina",
      descripcion: "Neutra, de asistente digital",
      recomendada: false,
    },
    // Evie - Engaging Expert
    {
      id: "Telnyx.Ultra.e5d4c33a-d8f6-46e8-a10f-b5afecc35648",
      nombre: "Evie",
      genero: "femenina",
      descripcion: "Formal y corporativa",
      recomendada: false,
    },
    // Fiona - Witty Woman
    {
      id: "Telnyx.Ultra.a01c369f-6d2d-4185-bc20-b32c225eab70",
      nombre: "Fiona",
      genero: "femenina",
      descripcion: "Alegre y enérgica",
      recomendada: false,
    },
    // Gemma - Decisive Agent
    {
      id: "Telnyx.Ultra.62ae83ad-4f6a-430b-af41-a9bede9286ca",
      nombre: "Gemma",
      genero: "femenina",
      descripcion: "Segura y expresiva",
      recomendada: false,
    },
    // Julia - Gentle Guide
    {
      id: "Telnyx.Ultra.273f9ef7-9fc2-4def-88bb-ab108c6249ca",
      nombre: "Julia",
      genero: "femenina",
      descripcion: "Suave y delicada",
      recomendada: false,
    },
    // Pippa - Bright Assistant
    {
      id: "Telnyx.Ultra.81cd8d19-45e7-47b2-ad0e-bcd94f557ad0",
      nombre: "Pippa",
      genero: "femenina",
      descripcion: "Alegre y servicial",
      recomendada: false,
    },
    // Saira - Organized Coordinator
    {
      id: "Telnyx.Ultra.1e9b9b3d-d2ce-4cac-9d05-bc36a63fa28e",
      nombre: "Saira",
      genero: "femenina",
      descripcion: "Cálida y atenta",
      recomendada: false,
    },
    // George - Composed Consultant
    {
      id: "Telnyx.Ultra.4bc3cb8c-adb9-4bb8-b5d5-cbbef950b991",
      nombre: "George",
      genero: "masculina",
      descripcion: "Sereno y resolutivo",
      recomendada: true,
    },
    // Alistair - Composed Consultant
    {
      id: "Telnyx.Ultra.c8f7835e-28a3-4f0c-80d7-c1302ac62aae",
      nombre: "Alistair",
      genero: "masculina",
      descripcion: "Sofisticado y sereno",
      recomendada: true,
    },
    // Harrison - Diligent Detailer
    {
      id: "Telnyx.Ultra.df89f42f-f285-4613-adbf-14eedcec4c9e",
      nombre: "Harrison",
      genero: "masculina",
      descripcion: "Nítido y eficiente",
      recomendada: true,
    },
    // Oliver - Customer Chap
    {
      id: "Telnyx.Ultra.ee7ea9f8-c0c1-498c-9279-764d6b56d189",
      nombre: "Oliver",
      genero: "masculina",
      descripcion: "Educado y joven",
      recomendada: true,
    },
    // Alec - Spirited Salesman
    {
      id: "Telnyx.Ultra.17044048-bfab-44b2-9532-9c1b65e9c217",
      nombre: "Alec",
      genero: "masculina",
      descripcion: "Animado y cálido",
      recomendada: false,
    },
    // Alfie - Composed Advisor
    {
      id: "Telnyx.Ultra.5e7d492a-5502-482e-b315-ebf587427806",
      nombre: "Alfie",
      genero: "masculina",
      descripcion: "Calmado y equilibrado",
      recomendada: false,
    },
    // Archie - Approachable Mate
    {
      id: "Telnyx.Ultra.ef191366-f52f-447a-a398-ed8c0f2943a1",
      nombre: "Archie",
      genero: "masculina",
      descripcion: "Cercano e informal",
      recomendada: false,
    },
    // Arthur - Polished Advisor
    {
      id: "Telnyx.Ultra.bb7e8daa-8b79-47a2-8408-a7a1cc72b53c",
      nombre: "Arthur",
      genero: "masculina",
      descripcion: "Refinado y seguro",
      recomendada: false,
    },
    // Benedict - Measured Mediator
    {
      id: "Telnyx.Ultra.3c0f09d6-e0d7-499c-a594-70c5b7b93048",
      nombre: "Benedict",
      genero: "masculina",
      descripcion: "Pulido y formal",
      recomendada: false,
    },
    // Benedict - Royal Narrator
    {
      id: "Telnyx.Ultra.7cf0e2b1-8daf-4fe4-89ad-f6039398f359",
      nombre: "Benedict (narrador)",
      genero: "masculina",
      descripcion: "Firme y seguro",
      recomendada: false,
    },
    // Casper - Gentle Narrator
    {
      id: "Telnyx.Ultra.4f7f1324-1853-48a6-b294-4e78e8036a83",
      nombre: "Casper",
      genero: "masculina",
      descripcion: "Joven y melancólico",
      recomendada: false,
    },
    // Clive - Measured Expert
    {
      id: "Telnyx.Ultra.b24f41fd-00a3-4cd8-992a-a0c9f13f3ef1",
      nombre: "Clive",
      genero: "masculina",
      descripcion: "Sereno y articulado",
      recomendada: false,
    },
    // Finn - Engaging Host
    {
      id: "Telnyx.Ultra.15070120-82ab-48e5-87e5-c4bf28fa4bf9",
      nombre: "Finn",
      genero: "masculina",
      descripcion: "Alegre y amable",
      recomendada: false,
    },
    // Gary - Composed Advisor
    {
      id: "Telnyx.Ultra.dc52ada6-0e11-4684-a8fa-e0af5b7bdcb2",
      nombre: "Gary",
      genero: "masculina",
      descripcion: "Directo y mesurado",
      recomendada: false,
    },
    // Griffin - Narrator
    {
      id: "Telnyx.Ultra.c99d36f3-5ffd-4253-803a-535c1bc9c306",
      nombre: "Griffin",
      genero: "masculina",
      descripcion: "Voz mayor de narrador",
      recomendada: false,
    },
    // Hugo - Teatime Friend
    {
      id: "Telnyx.Ultra.1463a4e1-56a1-4b41-b257-728d56e93605",
      nombre: "Hugo",
      genero: "masculina",
      descripcion: "Joven y expresivo",
      recomendada: false,
    },
    // Jasper - Service Specialist
    {
      id: "Telnyx.Ultra.3faa81ae-d3d8-4ab1-9e44-e50e46d33c30",
      nombre: "Jasper",
      genero: "masculina",
      descripcion: "Cálido y expresivo",
      recomendada: false,
    },
    // Martin - Meticulous Operator
    {
      id: "Telnyx.Ultra.dcddf1f4-b114-4b5d-9158-895cbba0e406",
      nombre: "Martin",
      genero: "masculina",
      descripcion: "Maduro y meticuloso",
      recomendada: false,
    },
    // Miles - Yogi
    {
      id: "Telnyx.Ultra.f114a467-c40a-4db8-964d-aaba89cd08fa",
      nombre: "Miles",
      genero: "masculina",
      descripcion: "Grave y relajante",
      recomendada: false,
    },
    // Oscar - Clear Specialist
    {
      id: "Telnyx.Ultra.22df7143-7987-4e15-a720-d65c69a443b3",
      nombre: "Oscar",
      genero: "masculina",
      descripcion: "Profesional y enérgico",
      recomendada: false,
    },
    // Owen - Support Anchor
    {
      id: "Telnyx.Ultra.0ea47942-be0b-4bc7-a1bf-5dba008dc1cc",
      nombre: "Owen",
      genero: "masculina",
      descripcion: "Preciso y eficiente",
      recomendada: false,
    },
    // Quentin - Refined Narrator
    {
      id: "Telnyx.Ultra.5568a7df-e5ab-4442-9fae-2e9ba1b15ad8",
      nombre: "Quentin",
      genero: "masculina",
      descripcion: "Refinado y pausado",
      recomendada: false,
    },
    // Rowan - Steady Guide
    {
      id: "Telnyx.Ultra.8c254787-4eb4-4577-bd3d-fb3c273baea2",
      nombre: "Rowan",
      genero: "masculina",
      descripcion: "Firme y fiable",
      recomendada: false,
    },
    // Roy - Stern Realist
    {
      id: "Telnyx.Ultra.f2ddbdca-59d9-4363-abeb-a197d65ea24a",
      nombre: "Roy",
      genero: "masculina",
      descripcion: "Serio y experimentado",
      recomendada: false,
    },
    // Rupert - Caring Dad
    {
      id: "Telnyx.Ultra.0ad65e7f-006c-47cf-bd31-52279d487913",
      nombre: "Rupert",
      genero: "masculina",
      descripcion: "Cálido y paternal",
      recomendada: false,
    },
    // Toby - Genuine Guide
    {
      id: "Telnyx.Ultra.3d5ce2fb-e56c-42f0-9ed9-4662484063b4",
      nombre: "Toby",
      genero: "masculina",
      descripcion: "Cálido y conversador",
      recomendada: false,
    },
  ],
  // 33 voces: 17 mujeres (4 recomendadas), 16 hombres (4 recomendadas)
  "fr-FR": [
    // Léa - Logical Liaison
    {
      id: "Telnyx.Ultra.c96a7d7d-3457-4979-8665-522f7b3e36fb",
      nombre: "Léa",
      genero: "femenina",
      descripcion: "Metódica y precisa",
      recomendada: true,
    },
    // Amélie - Decisive Agent
    {
      id: "Telnyx.Ultra.faa75703-00e3-4a57-9955-0703001e3231",
      nombre: "Amélie",
      genero: "femenina",
      descripcion: "Pulida y resolutiva",
      recomendada: true,
    },
    // Eloise - Dialogue Anchor
    {
      id: "Telnyx.Ultra.6c64b57a-bc65-48e4-bff4-12dbe85606cd",
      nombre: "Eloise",
      genero: "femenina",
      descripcion: "Clara y cálida",
      recomendada: true,
    },
    // Solène - Customer Champion
    {
      id: "Telnyx.Ultra.c9f95851-235c-458c-acfb-67cdb2558538",
      nombre: "Solène",
      genero: "femenina",
      descripcion: "Servicial y segura",
      recomendada: true,
    },
    // Élise - Efficient Liaison
    {
      id: "Telnyx.Ultra.658607d6-26cd-4ab5-8a36-d964ee4b1051",
      nombre: "Élise",
      genero: "femenina",
      descripcion: "Ágil y eficaz",
      recomendada: false,
    },
    // Elise - Information Steward
    {
      id: "Telnyx.Ultra.d6f67b55-1fec-4319-8949-32ec9fa863c9",
      nombre: "Elise (informadora)",
      genero: "femenina",
      descripcion: "Serena y atenta",
      recomendada: false,
    },
    // Emmanuelle
    {
      id: "Telnyx.Ultra.735287ee-ce91-4b08-8de4-63315c5ba1fb",
      nombre: "Emmanuelle",
      genero: "femenina",
      descripcion: "Enérgica y alegre",
      recomendada: false,
    },
    // Inaya - Reassuring Support
    {
      id: "Telnyx.Ultra.5f83e88f-9b5a-4563-95c4-904f4b0036e9",
      nombre: "Inaya",
      genero: "femenina",
      descripcion: "Calmada y empática",
      recomendada: false,
    },
    // Inès - Poised Communicator
    {
      id: "Telnyx.Ultra.7c58f4a4-a72c-42fa-a503-41b9408820f3",
      nombre: "Inès",
      genero: "femenina",
      descripcion: "Segura y articulada",
      recomendada: false,
    },
    // Jade - Steady Companion
    {
      id: "Telnyx.Ultra.92579402-6868-412e-b845-3efed0be7a9e",
      nombre: "Jade",
      genero: "femenina",
      descripcion: "Serena y precisa",
      recomendada: false,
    },
    // Juliette
    {
      id: "Telnyx.Ultra.c9115185-0086-4cf4-bfdd-0d36425db387",
      nombre: "Juliette",
      genero: "femenina",
      descripcion: "Joven y animada",
      recomendada: false,
    },
    // Louise - Tone Anchor
    {
      id: "Telnyx.Ultra.e70cceed-576e-4fc1-9fc1-f1e137f15367",
      nombre: "Louise",
      genero: "femenina",
      descripcion: "Metódica y cercana",
      recomendada: false,
    },
    // Maëlle B - Care Desk
    {
      id: "Telnyx.Ultra.80f117a5-5196-4b64-8b4c-efda3d3ab176",
      nombre: "Maëlle",
      genero: "femenina",
      descripcion: "Mesurada y empática",
      recomendada: false,
    },
    // Manon - Bright Belle
    {
      id: "Telnyx.Ultra.2f8e82c4-cb94-4e6d-8b6a-29bf58ceb60a",
      nombre: "Manon",
      genero: "femenina",
      descripcion: "Joven y alegre",
      recomendada: false,
    },
    // Pauline - Helpful Companion
    {
      id: "Telnyx.Ultra.65b25c5d-ff07-4687-a04c-da2f43ef6fa9",
      nombre: "Pauline",
      genero: "femenina",
      descripcion: "Alegre, como una amiga",
      recomendada: false,
    },
    // Valérie - Vibrant Voice
    {
      id: "Telnyx.Ultra.0d09e991-5763-406e-b637-02bc431ef72d",
      nombre: "Valérie",
      genero: "femenina",
      descripcion: "Vibrante y enérgica",
      recomendada: false,
    },
    // Zoé - Informative Dispatcher
    {
      id: "Telnyx.Ultra.b56a7171-86f0-42b6-b3fa-a316794aa4e0",
      nombre: "Zoé",
      genero: "femenina",
      descripcion: "Clara y puntual",
      recomendada: false,
    },
    // Laurent - Dependable Anchor
    {
      id: "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4",
      nombre: "Laurent",
      genero: "masculina",
      descripcion: "Firme y corporativo",
      recomendada: true,
    },
    // Antoine - Stern Man
    {
      id: "Telnyx.Ultra.0418348a-0ca2-4e90-9986-800fb8b3bbc0",
      nombre: "Antoine",
      genero: "masculina",
      descripcion: "Claro y suave",
      recomendada: true,
    },
    // Benoît - Methodical Moderator
    {
      id: "Telnyx.Ultra.5def377d-908b-4540-8bd7-3c968fcae351",
      nombre: "Benoît",
      genero: "masculina",
      descripcion: "Claro y metódico",
      recomendada: true,
    },
    // Maxime - Methodical Moderator
    {
      id: "Telnyx.Ultra.cc7d2711-69af-4072-9674-df588dd85682",
      nombre: "Maxime",
      genero: "masculina",
      descripcion: "Calmado y resolutivo",
      recomendada: true,
    },
    // Dorian - Supportive Analyst
    {
      id: "Telnyx.Ultra.57c90262-e4a1-4496-b256-98e3a92d8d82",
      nombre: "Dorian",
      genero: "masculina",
      descripcion: "Organizado y tranquilizador",
      recomendada: false,
    },
    // Erwan - Everyday Speaker
    {
      id: "Telnyx.Ultra.ab636c8b-9960-4fb3-bb0c-b7b655fb9745",
      nombre: "Erwan",
      genero: "masculina",
      descripcion: "Claro y constante",
      recomendada: false,
    },
    // Gerard
    {
      id: "Telnyx.Ultra.5deeaea9-c3cf-4288-82ec-22d8f04eb158",
      nombre: "Gerard",
      genero: "masculina",
      descripcion: "Grave y con autoridad",
      recomendada: false,
    },
    // Jules - Polished Host
    {
      id: "Telnyx.Ultra.8f1e9d27-96ff-405e-9213-7432a784ac0b",
      nombre: "Jules",
      genero: "masculina",
      descripcion: "Pulido y seguro",
      recomendada: false,
    },
    // Leo
    {
      id: "Telnyx.Ultra.adff5dcb-249f-463f-aa89-d98d8ca05e88",
      nombre: "Leo",
      genero: "masculina",
      descripcion: "Enérgico y motivador",
      recomendada: false,
    },
    // Louis - Methodical Inquirer
    {
      id: "Telnyx.Ultra.004e0148-b251-48ae-b77a-234fbb5e2099",
      nombre: "Louis",
      genero: "masculina",
      descripcion: "Calmado y analítico",
      recomendada: false,
    },
    // Mathieu - Assured Expert
    {
      id: "Telnyx.Ultra.93c98a2b-7d15-4f7b-8236-294b1e02b1c0",
      nombre: "Mathieu",
      genero: "masculina",
      descripcion: "Seguro y experto",
      recomendada: false,
    },
    // Mathis - Analytical Explanator
    {
      id: "Telnyx.Ultra.996ec149-0dca-4389-ad08-e2d6f906b4bf",
      nombre: "Mathis",
      genero: "masculina",
      descripcion: "Reflexivo y mesurado",
      recomendada: false,
    },
    // Nolan - Solution Planner
    {
      id: "Telnyx.Ultra.78291f16-fc9b-4f72-a21b-1ac7d767d104",
      nombre: "Nolan",
      genero: "masculina",
      descripcion: "Metódico y fiable",
      recomendada: false,
    },
    // Pierre
    {
      id: "Telnyx.Ultra.bfd5390b-e4f9-4e44-95ab-9ebd223acd62",
      nombre: "Pierre",
      genero: "masculina",
      descripcion: "Profesional y tranquilo",
      recomendada: false,
    },
    // Vincent
    {
      id: "Telnyx.Ultra.80e11491-2d8a-4361-ac61-c4f3e0a4f7e7",
      nombre: "Vincent",
      genero: "masculina",
      descripcion: "Enérgico y animado",
      recomendada: false,
    },
    // Younes - Clear Helper
    {
      id: "Telnyx.Ultra.fbc431c6-7d79-4ef5-b1bb-aab9f579c690",
      nombre: "Younes",
      genero: "masculina",
      descripcion: "Claro y tranquilizador",
      recomendada: false,
    },
  ],
  // 33 voces: 16 mujeres (4 recomendadas), 17 hombres (4 recomendadas)
  "de-DE": [
    // Alina - Engaging Assistant
    {
      id: "Telnyx.Ultra.38aabb6a-f52b-4fb0-a3d1-988518f4dc06",
      nombre: "Alina",
      genero: "femenina",
      descripcion: "Cálida, de atención telefónica",
      recomendada: true,
    },
    // Emi
    {
      id: "Telnyx.Ultra.43a317e9-f1b9-45bf-bbdb-1d4a52e46f0d",
      nombre: "Emi",
      genero: "femenina",
      descripcion: "Tranquila y neutra",
      recomendada: true,
    },
    // Sibylle
    {
      id: "Telnyx.Ultra.b629d743-2b5a-4ffd-b5bb-9de9b969a690",
      nombre: "Sibylle",
      genero: "femenina",
      descripcion: "Clara y segura",
      recomendada: true,
    },
    // Viktoria - Phone Conversationalist
    {
      id: "Telnyx.Ultra.b9de4a89-2257-424b-94c2-db18ba68c81a",
      nombre: "Viktoria",
      genero: "femenina",
      descripcion: "Clara y suave",
      recomendada: true,
    },
    // Eleni - Troubleshooter
    {
      id: "Telnyx.Ultra.c0c52199-e35f-4681-b68a-949ee499617e",
      nombre: "Eleni",
      genero: "femenina",
      descripcion: "Cercana, acento suizo",
      recomendada: false,
    },
    // Jennifer
    {
      id: "Telnyx.Ultra.ac197a78-cec7-4c50-93e5-93bdc1910b11",
      nombre: "Jennifer",
      genero: "femenina",
      descripcion: "Cercana y conversadora",
      recomendada: false,
    },
    // Karin - Companion
    {
      id: "Telnyx.Ultra.3f4ade23-6eb4-4279-ab05-6a144947c4d5",
      nombre: "Karin",
      genero: "femenina",
      descripcion: "Amable e informal",
      recomendada: false,
    },
    // Klara - Empathetic Voice
    {
      id: "Telnyx.Ultra.2578354e-4b18-4d28-832c-5943344b7085",
      nombre: "Klara",
      genero: "femenina",
      descripcion: "Dulce y tranquilizadora",
      recomendada: false,
    },
    // Lea - Breezy Voice
    {
      id: "Telnyx.Ultra.1ade29fc-6b82-4607-9e70-361720139b12",
      nombre: "Lea",
      genero: "femenina",
      descripcion: "Suave e informal",
      recomendada: false,
    },
    // Lena - Muse
    {
      id: "Telnyx.Ultra.4ab1ff51-476d-42bb-8019-4d315f7c0c05",
      nombre: "Lena",
      genero: "femenina",
      descripcion: "Sobria y clara",
      recomendada: false,
    },
    // Leni - Daymaker
    {
      id: "Telnyx.Ultra.adc919b3-6ebf-47fd-8a46-27c5169d6d94",
      nombre: "Leni",
      genero: "femenina",
      descripcion: "Alegre y entusiasta",
      recomendada: false,
    },
    // Lorelei - Helpful Guide
    {
      id: "Telnyx.Ultra.0b66a153-548f-4f2c-b734-09a13b0bd163",
      nombre: "Lorelei",
      genero: "femenina",
      descripcion: "Calmada y bien articulada",
      recomendada: false,
    },
    // Marlene - Elegant Speaker
    {
      id: "Telnyx.Ultra.9b4d08b6-0494-4301-ab92-9150f4ee2718",
      nombre: "Marlene",
      genero: "femenina",
      descripcion: "Elegante y formal",
      recomendada: false,
    },
    // Rena
    {
      id: "Telnyx.Ultra.de07efe3-b309-418b-bdca-42827223efd2",
      nombre: "Rena",
      genero: "femenina",
      descripcion: "Joven y expresiva",
      recomendada: false,
    },
    // Sabine - Firm Newscaster
    {
      id: "Telnyx.Ultra.6d4b1416-8d54-4d94-a788-8a802c086544",
      nombre: "Sabine",
      genero: "femenina",
      descripcion: "Suave pero firme",
      recomendada: false,
    },
    // Vreni - Diligent Advisor
    {
      id: "Telnyx.Ultra.40e0f496-a220-46bb-975a-7ef465b3d92b",
      nombre: "Vreni",
      genero: "femenina",
      descripcion: "Serena, acento suizo",
      recomendada: false,
    },
    // Lukas - Professional
    {
      id: "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954",
      nombre: "Lukas",
      genero: "masculina",
      descripcion: "Seguro, de atención telefónica",
      recomendada: true,
    },
    // Hermann - Businessman
    {
      id: "Telnyx.Ultra.f6f315e4-4fb3-4440-92ea-2edb01f9bf1b",
      nombre: "Hermann",
      genero: "masculina",
      descripcion: "Cálido y seguro",
      recomendada: true,
    },
    // Nico - Friendly Agent
    {
      id: "Telnyx.Ultra.afa425cf-5489-4a09-8a3f-d3cb1f82150d",
      nombre: "Nico",
      genero: "masculina",
      descripcion: "Desenfadado y cercano",
      recomendada: true,
    },
    // Thomas - Anchor
    {
      id: "Telnyx.Ultra.384b625b-da5d-49e8-a76d-a2855d4f31eb",
      nombre: "Thomas",
      genero: "masculina",
      descripcion: "Formal y sincero",
      recomendada: true,
    },
    // Alexander - Reliable Advisor
    {
      id: "Telnyx.Ultra.cd7b67f4-22a4-49a0-a197-3fa16f7e64d4",
      nombre: "Alexander",
      genero: "masculina",
      descripcion: "Firme y fiable",
      recomendada: false,
    },
    // Andreas - Recorder
    {
      id: "Telnyx.Ultra.db229dfe-f5de-4be4-91fd-7b077c158578",
      nombre: "Andreas",
      genero: "masculina",
      descripcion: "Suave, de narrador",
      recomendada: false,
    },
    // Christian
    {
      id: "Telnyx.Ultra.3264ada2-4a79-4666-badc-49e2267be692",
      nombre: "Christian",
      genero: "masculina",
      descripcion: "Enérgico y expresivo",
      recomendada: false,
    },
    // Clemens - Precise Instructor
    {
      id: "Telnyx.Ultra.57a3a9e0-a91c-4c94-a2bb-e6cbab3ae649",
      nombre: "Clemens",
      genero: "masculina",
      descripcion: "Claro y preciso",
      recomendada: false,
    },
    // Dieter - Commercial Man
    {
      id: "Telnyx.Ultra.2be00b67-d53f-4eb5-89e7-96c224d56fbc",
      nombre: "Dieter",
      genero: "masculina",
      descripcion: "Potente y expresivo",
      recomendada: false,
    },
    // Henrik - Steady Analyst
    {
      id: "Telnyx.Ultra.d1cbea67-e4d3-47cd-be2a-2bd4e646b002",
      nombre: "Henrik",
      genero: "masculina",
      descripcion: "Articulado y fiable",
      recomendada: false,
    },
    // Jan
    {
      id: "Telnyx.Ultra.42f14755-88c3-4124-aae3-5cc3a9618e8f",
      nombre: "Jan",
      genero: "masculina",
      descripcion: "Claro y didáctico",
      recomendada: false,
    },
    // Jonas
    {
      id: "Telnyx.Ultra.dff81230-ff75-49a4-af44-f6b2f43500d8",
      nombre: "Jonas",
      genero: "masculina",
      descripcion: "Cálido e informal",
      recomendada: false,
    },
    // Klaus - Archivist
    {
      id: "Telnyx.Ultra.24c61c42-b538-468e-a9ad-16c7a032c9cb",
      nombre: "Klaus",
      genero: "masculina",
      descripcion: "Grave y sereno",
      recomendada: false,
    },
    // Leander
    {
      id: "Telnyx.Ultra.758a5cff-af0b-4bdf-84bd-4c1b5525c249",
      nombre: "Leander",
      genero: "masculina",
      descripcion: "Cálido y cercano",
      recomendada: false,
    },
    // Moritz - Modern Communicator
    {
      id: "Telnyx.Ultra.4ad22058-7cb6-402c-a115-196cbfc25dce",
      nombre: "Moritz",
      genero: "masculina",
      descripcion: "Nítido y moderno",
      recomendada: false,
    },
    // Oskar - Steady Advisor
    {
      id: "Telnyx.Ultra.d42fc8d7-efdd-44df-bb2e-a6e093601917",
      nombre: "Oskar",
      genero: "masculina",
      descripcion: "Experimentado y sereno",
      recomendada: false,
    },
    // Sebastian - Orator
    {
      id: "Telnyx.Ultra.b7187e84-fe22-4344-ba4a-bc013fcb533e",
      nombre: "Sebastian",
      genero: "masculina",
      descripcion: "Cálido y claro",
      recomendada: false,
    },
  ],
  // 13 voces: 6 mujeres (3 recomendadas), 7 hombres (4 recomendadas)
  "it-IT": [
    // Sofia - Methodical Moderator
    {
      id: "Telnyx.Ultra.90c7d657-9599-4cd0-9ed2-2568359e4d1a",
      nombre: "Sofia",
      genero: "femenina",
      descripcion: "Pulida y eficiente",
      recomendada: true,
    },
    // Alessandra - Melodic Guide
    {
      id: "Telnyx.Ultra.0e21713a-5e9a-428a-bed4-90d410b87f13",
      nombre: "Alessandra",
      genero: "femenina",
      descripcion: "Elegante y melodiosa",
      recomendada: true,
    },
    // Elena - Client Liaison
    {
      id: "Telnyx.Ultra.00e9ec78-2002-41dd-8d19-6b1d3b17a461",
      nombre: "Elena",
      genero: "femenina",
      descripcion: "Serena y articulada",
      recomendada: true,
    },
    // Francesca - Elegant Partner
    {
      id: "Telnyx.Ultra.d609f27f-f1a4-410f-85bb-10037b4fba99",
      nombre: "Francesca",
      genero: "femenina",
      descripcion: "Natural y clara",
      recomendada: false,
    },
    // Giulia - Teacherly Voice
    {
      id: "Telnyx.Ultra.36d94908-c5b9-4014-b521-e69aee5bead0",
      nombre: "Giulia",
      genero: "femenina",
      descripcion: "Firme, de profesora",
      recomendada: false,
    },
    // Liv - Casual Friend
    {
      id: "Telnyx.Ultra.d718e944-b313-4998-b011-d1cc078d4ef3",
      nombre: "Liv",
      genero: "femenina",
      descripcion: "Desenfadada y natural",
      recomendada: false,
    },
    // Marco - Friendly Conversationalist
    {
      id: "Telnyx.Ultra.79693aee-1207-4771-a01e-20c393c89e6f",
      nombre: "Marco",
      genero: "masculina",
      descripcion: "Amable y profesional",
      recomendada: true,
    },
    // Alessio - Clear Anchor
    {
      id: "Telnyx.Ultra.c8403b5c-6465-4396-9065-a440d376528a",
      nombre: "Alessio",
      genero: "masculina",
      descripcion: "Calmado y preciso",
      recomendada: true,
    },
    // Giancarlo - Support Leader
    {
      id: "Telnyx.Ultra.029c3c7a-b6d9-44f0-814b-200d849830ff",
      nombre: "Giancarlo",
      genero: "masculina",
      descripcion: "Grave y cercano",
      recomendada: true,
    },
    // Lorenzo - Hospitable Host
    {
      id: "Telnyx.Ultra.ee16f140-f6dc-490e-a1ed-c1d537ea0086",
      nombre: "Lorenzo",
      genero: "masculina",
      descripcion: "Cercano y hospitalario",
      recomendada: true,
    },
    // Fabio - Logistics Expert
    {
      id: "Telnyx.Ultra.526ab945-9cbf-4bd2-9c72-3833d55d4c68",
      nombre: "Fabio",
      genero: "masculina",
      descripcion: "Sereno y articulado",
      recomendada: false,
    },
    // Luca - Everyday Friend
    {
      id: "Telnyx.Ultra.e019ed7e-6079-4467-bc7f-b599a5dccf6f",
      nombre: "Luca",
      genero: "masculina",
      descripcion: "Desenfadado y natural",
      recomendada: false,
    },
    // Matteo - Gentle Narrator
    {
      id: "Telnyx.Ultra.408daed0-c597-4c27-aae8-fa0497d644bf",
      nombre: "Matteo",
      genero: "masculina",
      descripcion: "Tranquilizador y suave",
      recomendada: false,
    },
  ],
  // 7 voces: 2 mujeres (2 recomendadas), 5 hombres (3 recomendadas)
  "pt-PT": [
    // Beatriz - Support Guide
    {
      id: "Telnyx.Ultra.d4b44b9a-82bc-4b65-b456-763fce4c52f9",
      nombre: "Beatriz",
      genero: "femenina",
      descripcion: "Amable y natural",
      recomendada: true,
    },
    // Isabel - Confident Woman
    {
      id: "Telnyx.Ultra.f39bf583-3b3d-402f-9ffb-6179d9ec3e35",
      nombre: "Isabel",
      genero: "femenina",
      descripcion: "Segura y clara",
      recomendada: true,
    },
    // Paulo - Transfer Desk
    {
      id: "Telnyx.Ultra.250fdc17-cc1b-4ff1-8538-63988791cd3e",
      nombre: "Paulo",
      genero: "masculina",
      descripcion: "Cálido y eficiente",
      recomendada: true,
    },
    // Gaspar - Considerate Listener
    {
      id: "Telnyx.Ultra.e6b8bb73-2655-433d-8a10-7b8cf559d03b",
      nombre: "Gaspar",
      genero: "masculina",
      descripcion: "Empático y comprensivo",
      recomendada: true,
    },
    // Matias - Process Explainer
    {
      id: "Telnyx.Ultra.b1d18488-4aaa-47e7-9e4b-483c90a67968",
      nombre: "Matias",
      genero: "masculina",
      descripcion: "Claro y didáctico",
      recomendada: true,
    },
    // Diogo - Promotion Lead
    {
      id: "Telnyx.Ultra.fbee0e7d-a83a-4082-bad1-13c70f86da4e",
      nombre: "Diogo",
      genero: "masculina",
      descripcion: "Potente y persuasivo",
      recomendada: false,
    },
    // Tiago - Narration Expert
    {
      id: "Telnyx.Ultra.6a360542-a117-4ed5-9e09-e8bf9b05eabb",
      nombre: "Tiago",
      genero: "masculina",
      descripcion: "Calmado, de narrador",
      recomendada: false,
    },
  ],
  // 11 voces: 7 mujeres (4 recomendadas), 4 hombres (2 recomendadas)
  "nl-NL": [
    // Anneliese - Methodical Guide
    {
      id: "Telnyx.Ultra.225ba8cf-9fc2-4371-a78c-fe38ba38898a",
      nombre: "Anneliese",
      genero: "femenina",
      descripcion: "Clara y eficiente",
      recomendada: true,
    },
    // Fleur - Vibrant Voice
    {
      id: "Telnyx.Ultra.de075c71-b2dd-4723-848d-ea9aa9cd010b",
      nombre: "Fleur",
      genero: "femenina",
      descripcion: "Joven y animada",
      recomendada: true,
    },
    // Isa - Empathetic Ear
    {
      id: "Telnyx.Ultra.60e94cf5-8069-459f-a91e-3ff852a51107",
      nombre: "Isa",
      genero: "femenina",
      descripcion: "Cálida y expresiva",
      recomendada: true,
    },
    // Noa - Reassuring Responder
    {
      id: "Telnyx.Ultra.96355f3d-0179-4c9a-a8d8-11ef0779a9b8",
      nombre: "Noa",
      genero: "femenina",
      descripcion: "Suave y empática",
      recomendada: true,
    },
    // Anneke - Trusted Guide
    {
      id: "Telnyx.Ultra.ac317dac-1b8f-434f-b198-a490e2a4914d",
      nombre: "Anneke",
      genero: "femenina",
      descripcion: "Suave y cariñosa",
      recomendada: false,
    },
    // Femke - Global Host
    {
      id: "Telnyx.Ultra.4fbae271-89c4-494d-8181-6eddca393453",
      nombre: "Femke",
      genero: "femenina",
      descripcion: "Centrada y constante",
      recomendada: false,
    },
    // Sanne - Clear Companion
    {
      id: "Telnyx.Ultra.0eb213fe-4658-45bc-9442-33a48b24b133",
      nombre: "Sanne",
      genero: "femenina",
      descripcion: "Alegre y conversadora",
      recomendada: false,
    },
    // Stijn - Helpful Handler
    {
      id: "Telnyx.Ultra.da743a82-ddf2-4d9b-8eb8-ff67ca0b138e",
      nombre: "Stijn",
      genero: "masculina",
      descripcion: "Cercano y profesional",
      recomendada: true,
    },
    // Thijs - Confident Coordinator
    {
      id: "Telnyx.Ultra.95e9fdaf-cf0b-4739-b1de-3350ca50774a",
      nombre: "Thijs",
      genero: "masculina",
      descripcion: "Claro y metódico",
      recomendada: true,
    },
    // Jeroen - Clear Storyteller
    {
      id: "Telnyx.Ultra.4b250449-c635-4b63-bd1d-b654b12ffcd4",
      nombre: "Jeroen",
      genero: "masculina",
      descripcion: "Claro y firme",
      recomendada: false,
    },
    // Lucas - Storyteller
    {
      id: "Telnyx.Ultra.af482421-80f4-4379-b00c-a118def29cde",
      nombre: "Lucas",
      genero: "masculina",
      descripcion: "Articulado, de narrador",
      recomendada: false,
    },
  ],
};
