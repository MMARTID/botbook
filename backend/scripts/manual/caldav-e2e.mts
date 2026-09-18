// Comprobación manual del adaptador CalDAV contra un servidor real (Radicale
// en Docker), sin mocks: listar, crear (idempotente), ocupación, próximos,
// borrar y credenciales incorrectas. No corre en CI.
//
//   mkdir -p /tmp/radicale && printf 'pelu:secreto-app\n' > /tmp/radicale/users
//   cat > /tmp/radicale/config <<'CFG'
//   [server]
//   hosts = 0.0.0.0:5232
//   [auth]
//   type = htpasswd
//   htpasswd_filename = /config/users
//   htpasswd_encryption = plain
//   [storage]
//   filesystem_folder = /data/collections
//   [rights]
//   type = owner_only
//   CFG
//   docker run -d --name radicale-test -p 5232:5232 \
//     -v /tmp/radicale/config:/config/config:ro -v /tmp/radicale/users:/config/users:ro \
//     tomsquest/docker-radicale
//   curl -u pelu:secreto-app -X MKCOL http://localhost:5232/pelu/peluqueria/ \
//     -H 'Content-Type: application/xml' --data '<?xml version="1.0"?><create xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><set><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Peluquería</displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></prop></set></create>'
//   npx tsx scripts/manual/caldav-e2e.mts
//   docker rm -f radicale-test
//
// Contra iCloud real: cambia serverUrl por https://caldav.icloud.com, username
// por el Apple ID y appPassword por una contraseña de aplicación.
import { CaldavCalendarProvider } from "../../src/adapters/calendar/caldav/CaldavCalendarProvider.js";
import { hashDeIdempotencia } from "../../src/adapters/calendar/eventoDeCalendario.js";

const adaptador = new CaldavCalendarProvider();
const cuenta = {
  credentials: {
    provider: "caldav" as const,
    serverUrl: "http://localhost:5232",
    username: "pelu",
    appPassword: "secreto-app",
  },
};

console.log("1) listarCalendarios");
const calendarios = await adaptador.listarCalendarios(cuenta);
console.log("   ", calendarios);
const calendarId = calendarios.find((c) => c.name === "Peluquería")!.id;
const conexion = { ...cuenta, provider: "caldav" as const, calendarId };

const evento = {
  summary: "Corte + Barba — Marta López",
  description:
    "Cliente: Marta López\nTeléfono: +34600111222\n\nCita generada por el asistente virtual de Alhabla.",
  startTime: new Date("2026-09-21T10:00:00Z"),
  endTime: new Date("2026-09-21T10:30:00Z"),
  cliente: { nombre: "Marta López", telefono: "+34600111222", email: null },
  recordatorioInmediatoMinutos: 60,
  recordatorioPrevioMinutos: 120,
  zonaHoraria: "Europe/Madrid",
  idempotencyDigest: hashDeIdempotencia("call_e2e_1"),
};
console.log("2) crearEvento");
const creado = await adaptador.crearEvento(conexion, evento);
console.log("   ", creado);
console.log("3) crearEvento otra vez (reintento) → mismo href, sin duplicar");
const repetido = await adaptador.crearEvento(conexion, evento);
console.log(
  "   ",
  repetido.id === creado.id ? "mismo href ✓" : "HREF DISTINTO ✗"
);

const ventana = {
  timeMin: new Date("2026-09-21T00:00:00Z"),
  timeMax: new Date("2026-09-22T00:00:00Z"),
};
console.log("4) listarOcupacion");
const ocupacion = await adaptador.listarOcupacion(conexion, ventana);
console.log("   ", ocupacion);
console.log("5) listarProximosEventos (30 días desde hoy)");
console.log(
  "   ",
  (await adaptador.listarProximosEventos(conexion, 5)).length,
  "eventos"
);
console.log("6) borrarEvento");
await adaptador.borrarEvento(conexion, creado.id!);
console.log(
  "   ocupación tras borrar:",
  (await adaptador.listarOcupacion(conexion, ventana)).length
);
console.log("7) borrar de nuevo (404 → éxito):");
await adaptador.borrarEvento(conexion, creado.id!);
console.log("   ok");
console.log("8) contraseña incorrecta →");
try {
  await adaptador.listarCalendarios({
    credentials: { ...cuenta.credentials, appPassword: "mala" },
  });
  console.log("   NO FALLÓ ✗");
} catch (e: any) {
  console.log("   ", e.name, e.code, "|", e.message);
}
console.log(
  "9) ocupación con contraseña incorrecta → debe LANZAR (no lista vacía)"
);
try {
  await adaptador.listarOcupacion(
    {
      ...conexion,
      credentials: { ...cuenta.credentials, appPassword: "mala" },
    },
    ventana
  );
  console.log("   NO FALLÓ ✗");
} catch (e: any) {
  console.log("   lanza", e.name, e.status ?? e.code, "✓");
}
