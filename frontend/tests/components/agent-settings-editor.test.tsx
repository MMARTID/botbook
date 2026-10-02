import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AgentSettingsEditor,
  DEFAULT_AGENT_SETTINGS,
} from "@/components/agent-settings-editor";
import type { AgentSettings } from "@/lib/types";

function renderizar(value: AgentSettings = DEFAULT_AGENT_SETTINGS) {
  const onChange = vi.fn();
  render(
    <AgentSettingsEditor
      value={value}
      isSaving={false}
      onChange={onChange}
      onSave={vi.fn()}
      open
      onToggle={vi.fn()}
    />
  );
  return { onChange };
}

describe("AgentSettingsEditor — idiomas", () => {
  it("ofrece euskera y gallego como idiomas de atención", () => {
    const { onChange } = renderizar();

    fireEvent.click(screen.getByRole("checkbox", { name: /Euskera/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ["es-ES", "eu-ES"] })
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Gallego/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "gl-ES"] })
    );
  });

  it("ofrece catalán, euskera y gallego como idioma principal si están activos", () => {
    const { onChange } = renderizar({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "gl-ES"],
    });

    expect(screen.getByText("Idioma principal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Euskera" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gallego" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ voiceLanguage: "gl-ES" })
    );
  });

  it("avisa de qué pasa con catalán, euskera o gallego según el idioma principal", () => {
    const { unmount } = render(
      <AgentSettingsEditor
        value={{ ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "en-GB"] }}
        isSaving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        open
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText(/contesta en español/)).toBeNull();
    unmount();

    renderizar({ ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES"] });
    expect(
      screen.getByText(/Entiende catalán, pero contesta en español/)
    ).toBeInTheDocument();
  });
});
