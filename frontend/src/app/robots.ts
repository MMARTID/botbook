import type { MetadataRoute } from "next";

// La app no se indexa: todo lo público está en la web (alhabla.ai).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
