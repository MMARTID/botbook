---
category: Cifras
---
Anima la parte numérica de una cifra al entrar en pantalla, dejando prefijo y
sufijo intactos: `78%`, `600M€`, `26.000` o `45-65€` cuentan sólo el primer
número y conservan el resto. Una cifra sin dígitos, o con valor 0, no es
animable y se muestra literal.

`value` es una **cadena**, no un número: el formato lo decides tú. Respeta
`prefers-reduced-motion` pintando el valor final directamente — que es también
lo que se ve en las tarjetas de este sistema, porque son capturas estáticas.

Cuidado al componer: cualquier bloque que embeba `CountUp` (por ejemplo
`SectorDataSection`) hereda esta animación, así que una captura tomada a mitad
de conteo muestra una cifra que no es la de los datos.
