import { SiWhatsapp } from "@icons-pack/react-simple-icons";
import type { NicheAccent, OwnerAssistantChat } from "@/lib/niche-landings";
import { Reveal } from "@/components/scroll-reveal";

const FALLBACK_ACCENT: NicheAccent = { strong: "#8b5cf6", soft: "#f3eeff", deep: "#6d28d9" };

/**
 * Mockup de una conversación real por WhatsApp entre el dueño y Alhabla: el
 * caso de la ausencia de un profesional, con la propuesta de reasignación y
 * los botones tal como los ve el dueño de verdad (propuesta + Confirmar
 * sobre una acción pendiente, patrón real del Gestor). No es una ilustración
 * genérica — reproduce el turno a turno de la conversación.
 *
 * Colores de burbuja iguales al resto del sitio (negro/blanco, como
 * `HeroConversation`): el icono y la cabecera ya dejan claro que es
 * WhatsApp, así que no hace falta el verde de marca de WhatsApp para
 * identificarlo — mantiene la Regla del Acento Único. La confirmación final
 * sí usa `--success`/`--success-surface` (verde de estado, no de marca),
 * porque es justo lo que representa: una acción ya hecha.
 */
export function OwnerAssistantChatMockup({ data, accent }: { data: OwnerAssistantChat; accent?: NicheAccent }) {
  const a = accent ?? FALLBACK_ACCENT;
  return (
    <div className="overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white">
      <div className="flex items-center gap-3 border-b border-[#e5e5e5] bg-[#fafafa] px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f8ee] text-[#25D366]">
          <SiWhatsapp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-[#0a0a0a]">Alhabla</p>
          <p className="text-xs leading-4 text-[#71717a]">WhatsApp del negocio</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <Reveal y={10}>
          <div className="flex justify-end">
            <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#0a0a0a] px-3.5 py-2 text-sm font-medium leading-5 text-white">
              {data.ownerMessage}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15} y={10}>
          <div className="flex justify-start">
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-[#e5e5e5] bg-white px-3.5 py-2 text-sm leading-5 text-[#27272a]">
              {data.proposal}
            </p>
          </div>
        </Reveal>

        {/* Los botones van pegados a la propuesta, como en WhatsApp de
            verdad: forman parte del mismo mensaje, no de uno nuevo. El
            primero lleva el estilo "pulsado" para dar a entender cuál
            elige el dueño en este ejemplo. */}
        <Reveal delay={0.3} y={10}>
          <div className="flex flex-col gap-1.5 pl-1 pt-0.5 sm:max-w-[85%]">
            <span
              className="rounded-full border px-3.5 py-1.5 text-center text-sm font-semibold"
              style={{ borderColor: a.strong, backgroundColor: a.soft, color: a.deep }}
            >
              {data.buttons[0]}
            </span>
            <span className="rounded-full border border-[#e5e5e5] px-3.5 py-1.5 text-center text-sm font-medium text-[#71717a]">
              {data.buttons[1]}
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.45} y={10}>
          <div className="flex justify-end">
            <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#0a0a0a] px-3.5 py-2 text-sm font-medium leading-5 text-white">
              {data.buttons[0]}
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.6} y={10}>
          <div className="flex justify-start">
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-[#ecf7ec] px-3.5 py-2 text-sm font-semibold leading-5 text-[#2c7334]">
              {data.confirmation}
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
