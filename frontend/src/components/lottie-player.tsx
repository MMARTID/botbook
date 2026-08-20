"use client";

import { Lottie } from "lottie-react";

/**
 * Capa interna cargada solo en cliente (lottie-web necesita `document`).
 * Se importa de forma dinámica desde `LottieAnimation`.
 */
export default function LottiePlayer({
  src,
  autoplay,
}: {
  src: string;
  autoplay: boolean;
}) {
  return (
    <Lottie
      src={src}
      loop
      autoplay={autoplay}
      style={{ display: "block", width: "100%", height: "auto" }}
    />
  );
}
