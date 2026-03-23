import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password registration is no longer supported. Please sign in with Google." },
    { status: 410 }
  );
}
