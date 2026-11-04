import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/csrf";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  await destroySession();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
