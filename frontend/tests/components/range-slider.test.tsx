import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tag } from "lucide-react";
import { RangeSlider } from "@/components/range-slider";

function renderSlider(overrides: Partial<React.ComponentProps<typeof RangeSlider>> = {}) {
  const onChange = vi.fn();
  render(
    <RangeSlider
      id="test-slider"
      icon={Tag}
      label="Ticket medio"
      value={40}
      min={10}
      max={200}
      step={5}
      onChange={onChange}
      ariaValueText="40 euros"
      displayValue="40 €"
      minLabel="10 €"
      maxLabel="200 €"
      {...overrides}
    />
  );
  return { onChange };
}

describe("RangeSlider", () => {
  it("muestra la etiqueta y el valor formateado", () => {
    renderSlider();

    expect(screen.getByText("Ticket medio")).toBeInTheDocument();
    expect(screen.getByText("40 €", { selector: "output" })).toBeInTheDocument();
  });

  it("expone el input nativo con role slider y su aria-valuetext", () => {
    renderSlider();

    const slider = screen.getByRole("slider", { name: "Ticket medio" });
    expect(slider).toHaveAttribute("aria-valuetext", "40 euros");
    expect(slider).toHaveAttribute("min", "10");
    expect(slider).toHaveAttribute("max", "200");
  });

  it("llama a onChange con el valor numérico al cambiarlo", () => {
    const { onChange } = renderSlider();
    const slider = screen.getByRole("slider", { name: "Ticket medio" });

    fireEvent.change(slider, { target: { value: "75" } });

    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("muestra el hint solo si se proporciona", () => {
    const { rerender } = render(
      <RangeSlider
        id="s"
        label="L"
        value={1}
        min={0}
        max={10}
        step={1}
        onChange={vi.fn()}
        ariaValueText="1"
        displayValue="1"
        minLabel="0"
        maxLabel="10"
      />
    );
    expect(screen.queryByText("Un consejo")).not.toBeInTheDocument();

    rerender(
      <RangeSlider
        id="s"
        label="L"
        value={1}
        min={0}
        max={10}
        step={1}
        onChange={vi.fn()}
        ariaValueText="1"
        displayValue="1"
        minLabel="0"
        maxLabel="10"
        hint="Un consejo"
      />
    );
    expect(screen.getByText("Un consejo")).toBeInTheDocument();
  });
});
