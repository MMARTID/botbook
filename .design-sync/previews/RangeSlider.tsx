import "./_sin-movimiento";
import * as React from "react";
import { RangeSlider } from "alhabla-ui";
import { CalendarX, Tag } from "lucide-react";

const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Uso canónico: el control de ticket medio de la calculadora de la landing. */
export function TicketMedio() {
  const [valor, setValor] = React.useState(35);
  return (
    <div className="panel w-full max-w-md p-5">
      <RangeSlider
        id="ticket-medio"
        icon={Tag}
        label="Ticket medio por servicio"
        value={valor}
        min={10}
        max={120}
        step={5}
        onChange={setValor}
        ariaValueText={`${valor} euros por servicio`}
        displayValue={euros.format(valor)}
        minLabel={euros.format(10)}
        maxLabel={euros.format(120)}
      />
    </div>
  );
}

/** `bare` quita el marco propio para encadenar varios dentro de un panel. */
export function EncadenadoBare() {
  const [ticket, setTicket] = React.useState(45);
  const [citas, setCitas] = React.useState(6);
  return (
    <div className="panel w-full max-w-md p-5">
      <RangeSlider
        id="bare-ticket"
        icon={Tag}
        label="Ticket medio por servicio"
        value={ticket}
        min={10}
        max={120}
        step={5}
        onChange={setTicket}
        ariaValueText={`${ticket} euros por servicio`}
        displayValue={euros.format(ticket)}
        minLabel={euros.format(10)}
        maxLabel={euros.format(120)}
        bare
      />
      <div className="my-5 border-t border-[#e5e5e5]" />
      <RangeSlider
        id="bare-citas"
        icon={CalendarX}
        label="Citas perdidas por semana"
        value={citas}
        min={1}
        max={30}
        step={1}
        onChange={setCitas}
        ariaValueText={`${citas} citas perdidas por semana`}
        displayValue={String(citas)}
        minLabel="1 cita"
        maxLabel="30 citas"
        bare
      />
    </div>
  );
}

/** `hint` explica la unidad y `showTicks` dibuja las marcas de cada paso. */
export function ConAyudaYMarcas() {
  const [plazas, setPlazas] = React.useState(3);
  return (
    <div className="panel w-full max-w-md p-5">
      <RangeSlider
        id="plazas"
        label="Plazas simultáneas"
        value={plazas}
        min={1}
        max={8}
        step={1}
        onChange={setPlazas}
        ariaValueText={`${plazas} plazas simultáneas`}
        displayValue={String(plazas)}
        minLabel="1"
        maxLabel="8"
        hint="Cuántas citas puede atender el negocio a la vez, independientemente del número de profesionales."
        showTicks
      />
    </div>
  );
}
