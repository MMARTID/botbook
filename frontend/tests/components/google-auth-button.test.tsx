import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { getGoogleAuthUrl } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGoogleAuthUrl: vi.fn() }));

const mockedGetGoogleAuthUrl = vi.mocked(getGoogleAuthUrl);

describe("GoogleAuthButton", () => {
  it("no navega ni pide la URL de Google mientras el registro está desactivado — muestra el aviso de 'en desarrollo'", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();

    render(<GoogleAuthButton onError={onError} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(mockedGetGoogleAuthUrl).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText(/social@alhabla\.ai/)).toBeInTheDocument();
  });
});
