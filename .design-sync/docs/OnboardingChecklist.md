---
category: Panel
---
Lista de los seis pasos que el negocio tiene que completar para que la
recepcionista atienda y reserve: horario, servicios, equipo, calendario, avisos
por WhatsApp y desvío del teléfono. Cada paso pendiente enlaza a donde se
configura (`/agente?section=…`, `/ajustes/telefono#whatsapp` o el bloque del
desvío), y la barra superior muestra el progreso.

No recibe props: lee `["onboarding-state"]` de React Query. Se descarta con la
X y desaparece al completarse.
