import "./_sin-movimiento";
import * as React from "react";
import { AgentSettingsEditor, DEFAULT_AGENT_SETTINGS } from "alhabla-ui";

/** Abierto con los valores por defecto que trae el propio módulo. */
export function Abierto() {
  const [valor, setValor] = React.useState(DEFAULT_AGENT_SETTINGS);
  return (
    <div className="w-full max-w-2xl">
      <AgentSettingsEditor
        value={valor}
        isSaving={false}
        onChange={setValor}
        onSave={() => {}}
        open
        onToggle={() => {}}
      />
    </div>
  );
}

/** Opciones no predeterminadas: voz masculina, tono directo, deriva a llamada. */
export function ConfiguracionAlternativa() {
  const [valor, setValor] = React.useState({
    ...DEFAULT_AGENT_SETTINGS,
    voiceGender: "masculina",
    tone: "direct",
    escalation: "transfer",
  });
  return (
    <div className="w-full max-w-2xl">
      <AgentSettingsEditor
        value={valor}
        isSaving={false}
        onChange={setValor}
        onSave={() => {}}
        open
        onToggle={() => {}}
      />
    </div>
  );
}

/** Cerrado: sólo la cabecera plegable con su resumen. */
export function Cerrado() {
  return (
    <div className="w-full max-w-2xl">
      <AgentSettingsEditor
        value={DEFAULT_AGENT_SETTINGS}
        isSaving={false}
        onChange={() => {}}
        onSave={() => {}}
        open={false}
        onToggle={() => {}}
      />
    </div>
  );
}
