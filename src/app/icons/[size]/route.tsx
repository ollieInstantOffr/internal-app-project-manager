import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/**
 * The app icon as PNG, at whatever size an installer asks for.
 *
 * Generated rather than committed because there's no image tooling in this
 * repo, and drawn as inline SVG rather than text so it needs no font to be
 * loaded — satori can't render a glyph it has no font for.
 */
const SIZES = [180, 192, 512];

export function generateStaticParams() {
  return SIZES.flatMap((size) => [{ size: `${size}` }, { size: `${size}-maskable` }]);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params;
  const maskable = raw.endsWith("-maskable");
  const size = Number(raw.replace("-maskable", "")) || 192;

  // A maskable icon gets cropped to whatever shape the OS likes, so the mark
  // sits inside the safe zone and the background runs to the edges.
  const inset = maskable ? 0.2 : 0.06;
  const radius = maskable ? 0 : size * 0.22;
  const mark = size * (1 - inset * 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c8f24a",
          borderRadius: radius,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32">
          <path
            d="M9.6 23 15 9h2.2l5.4 14h-2.6l-1.3-3.6h-5.3L12.1 23H9.6Zm4.9-5.7h3.9l-1.9-5.3-2 5.3Z"
            fill="#232a08"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
