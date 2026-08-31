import { absoluteUrl, defaultDescription, seoKeywords } from "@/lib/seo";

export default function Head() {
  return (
    <>
      <meta name="description" content={defaultDescription} />
      <meta name="keywords" content={seoKeywords.join(", ")} />
      <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
      <meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
      <meta name="author" content="Alhabla" />
      <meta name="geo.region" content="ES" />
      <meta name="geo.placename" content="España" />
      <meta name="language" content="es" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={absoluteUrl("/landing")} />
      <link rel="canonical" href={absoluteUrl("/landing")} />
    </>
  );
}
