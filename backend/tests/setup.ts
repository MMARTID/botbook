import { config } from "dotenv";

// Carga variables de entorno desde .env.test si existe, o .env por defecto.
config({ path: ".env.test" });

// Clave de cifrado de credenciales de calendario solo para tests (32 bytes
// fijos): así la suite no depende de .env.test ni de CI para tenerla.
process.env.CALENDAR_CREDENTIALS_KEY ??= Buffer.alloc(32, 7).toString("base64");

