import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

const MAGIC_BYTES: Array<{ ext: string; bytes: number[] }> = [
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageType(buffer: Buffer): string | null {
  for (const { ext, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buffer[i] === b)) return ext;
  }
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "File must be under 5MB" }, { status: 400 });

  const rawExt = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(rawExt))
    return NextResponse.json(
      { error: "Allowed formats: jpg, jpeg, png, gif, webp" },
      { status: 400 }
    );

  const buffer = Buffer.from(await file.arrayBuffer());

  const detectedType = detectImageType(buffer);
  if (!detectedType)
    return NextResponse.json({ error: "File does not appear to be a valid image" }, { status: 400 });

  const ext = detectedType === "jpg" ? "jpeg" : detectedType;
  const contentType = `image/${ext}`;

  const bucket = "avatars";
  const path = `${session.user.id}.${detectedType}`;

  const { error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError) {
    await supabase.storage.createBucket(bucket, { public: true });
  }

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("users")
    .update({ image: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", session.user.id);

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ image: publicUrl });
}
