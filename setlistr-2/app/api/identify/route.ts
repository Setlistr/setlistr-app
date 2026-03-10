import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const HOST = (process.env.ACRCLOUD_HOST || "").trim();
const ACCESS_KEY = (process.env.ACRCLOUD_ACCESS_KEY || "").trim();
const ACCESS_SECRET = (process.env.ACRCLOUD_ACCESS_SECRET || "").trim();

function createSignature(timestamp: string) {
  // Exact ACRCloud v1 signature string format:
  // POST\n/v1/identify\n{access_key}\naudio\n1\n{timestamp}
  const stringToSign = [
    "POST",
    "/v1/identify",
    ACCESS_KEY,
    "audio",
    "1",
    timestamp,
  ].join("\n");

  const signature = crypto
    .createHmac("sha1", Buffer.from(ACCESS_SECRET, "utf8"))
    .update(Buffer.from(stringToSign, "utf8"))
    .digest("base64");

  return { signature, stringToSign };
}

export async function POST(req: NextRequest) {
  try {
    if (!HOST || !ACCESS_KEY || !ACCESS_SECRET) {
      return NextResponse.json(
        {
          detected: false,
          error: "Missing ACRCloud env vars",
          debug: {
            hasHost: Boolean(HOST),
            hasAccessKey: Boolean(ACCESS_KEY),
            hasAccessSecret: Boolean(ACCESS_SECRET),
          },
        },
        { status: 500 }
      );
    }

    const incoming = await req.formData();
    const audio = incoming.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { detected: false, error: 'Expected FormData field "audio" as a File' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const { signature, stringToSign } = createSignature(timestamp);

    const acrForm = new FormData();
    acrForm.append("access_key", ACCESS_KEY);
    acrForm.append("sample_bytes", String(audioBuffer.length));
    acrForm.append("sample", new Blob([audioBuffer], { type: audio.type || "audio/webm" }), audio.name || "sample.webm");
    acrForm.append("timestamp", timestamp);
    acrForm.append("signature", signature);
    acrForm.append("data_type", "audio");
    acrForm.append("signature_version", "1");

    const acrResponse = await fetch(`https://${HOST}/v1/identify`, {
      method: "POST",
      body: acrForm,
    });

    const rawText = await acrResponse.text();

    let payload: any;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          detected: false,
          error: "ACRCloud returned non-JSON",
          raw: rawText,
          debug: {
            stringToSign,
            host: HOST,
            timestamp,
          },
        },
        { status: 502 }
      );
    }

    // Cover Song / Humming-style projects may not return metadata.music.
    // Check humming first, then music as fallback.
    const humming = payload?.metadata?.humming;
    const music = payload?.metadata?.music;

    const best =
      Array.isArray(humming) && humming.length > 0
        ? humming[0]
        : Array.isArray(music) && music.length > 0
        ? music[0]
        : null;

    if (best) {
      const title = best?.title ?? null;
      const artist =
        Array.isArray(best?.artists) && best.artists.length > 0
          ? best.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
          : null;

      return NextResponse.json({
        detected: true,
        title,
        artist,
        debug: payload?.status ?? null,
      });
    }

    return NextResponse.json({
      detected: false,
      debug: payload?.status ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        detected: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
