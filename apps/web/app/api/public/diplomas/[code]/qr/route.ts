import QRCode from "qrcode";
import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/domain/certificate-verification";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isUuid(code)) return new NextResponse("Not found", { status: 404 });
  const verificationUrl = new URL(`/diploma-verificatie/${code}`, request.nextUrl.origin).toString();
  const svg = await QRCode.toString(verificationUrl, {
    type: "svg",
    width: 320,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
    errorCorrectionLevel: "M"
  });
  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
