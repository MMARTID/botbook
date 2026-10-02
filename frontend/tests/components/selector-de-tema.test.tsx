import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectorDeTema } from "@/components/selector-de-tema";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tema;
});

describe("SelectorDeTema", () => {
  it("empieza en «Sistema» y cambia el tema al elegir otro", async () => {
    const user = userEvent.setup();
    render(<SelectorDeTema />);

    expect(screen.getByRole("radio", { name: "Sistema" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(screen.getByRole("radio", { name: "Oscuro" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.tema).toBe("oscuro");
    expect(localStorage.getItem("alhabla:tema")).toBe("oscuro");
  });
});
