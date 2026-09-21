/**
 * La contraseña de aplicación de Apple son 16 letras minúsculas en cuatro
 * bloques (xxxx-xxxx-xxxx-xxxx). La gente la copia con guiones, sin ellos,
 * con espacios o en mayúsculas, y a veces pega la contraseña de su cuenta de
 * Apple, que no vale. Se normaliza lo primero y se avisa de lo segundo antes
 * de molestar a iCloud.
 */
const LETRAS_ESPERADAS = 16;

export function normalizarContrasenaDeApp(texto: string): string {
  const letras = texto.toLowerCase().replace(/[^a-z]/g, "");
  if (letras.length !== LETRAS_ESPERADAS) return texto.trim();
  return letras.match(/.{4}/g)!.join("-");
}

export function pareceContrasenaDeApp(texto: string): boolean {
  return /^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(
    normalizarContrasenaDeApp(texto)
  );
}

export function pareceAppleId(texto: string): boolean {
  // El navegador ya valida el email (type="email"); esto es la red de
  // seguridad para el error típico: escribir solo el nombre, sin la @.
  return /^\S+@\S+$/.test(texto.trim());
}

/** Qué está mal antes de enviar, o `null` si tiene pinta de ir bien. */
export function errorPrevioDeApple(
  username: string,
  appPassword: string
): string | null {
  if (!pareceAppleId(username)) {
    return "El Apple ID es tu correo completo, con la @ (por ejemplo tu@icloud.com).";
  }
  if (!pareceContrasenaDeApp(appPassword)) {
    return "Eso no parece una contraseña de aplicación: son 16 letras en cuatro bloques (xxxx-xxxx-xxxx-xxxx). La contraseña de tu cuenta de Apple no vale; genera una de aplicación con el enlace de arriba.";
  }
  return null;
}
