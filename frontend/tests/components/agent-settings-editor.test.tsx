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

  it("avisa de que la voz cambia solo con catalán, euskera o gallego", () => {
    const aviso = /atiende una voz que habla todos tus idiomas/;

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
    expect(screen.queryByText(aviso)).toBeNull();
    unmount();

    renderizar({ ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "gl-ES"] });
    expect(screen.getByText(aviso)).toBeInTheDocument();
  });
});
