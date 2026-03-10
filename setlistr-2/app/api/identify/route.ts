import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const HOST = (process.env.ACRCLOUD_HOST || "").trim();
const ACCESS_KEY = (process.env.ACRCLOUD_ACCESS_KEY || "").trim();
const ACCESS_SECRET = (process.env.ACRCLOUD_ACCESS_SECRET || "").trim();

function buildSignature(timestamp: string) {
  // EXACT ACRCloud v1 signature string
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

  return { stringToSign, signature };
}

export async function POST(req: NextRequest) {
  try {
    if (!HOST || !ACCESS_KEY || !ACCESS_SECRET) {
      return NextResponse.json(
        {
          detected: false,
          error: "Missing ACRCloud environment variables",
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

    // ACRCloud suggests short audio clips; use 5–15 seconds when testing.
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const { stringToSign, signature } = buildSignature(timestamp);

    const acrForm = new FormData();
    acrForm.append("access_key", ACCESS_KEY);
    acrForm.append("sample_bytes", String(audioBuffer.length));
    acrForm.append("timestamp", timestamp);
    acrForm.append("signature", signature);
    acrForm.append("data_type", "audio");
    acrForm.append("signature_version", "1");

    acrForm.append(
      "sample",
      new Blob([audioBuffer], { type: audio.type || "application/octet-stream" }),
      audio.name || "sample.webm"
    );

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
          rawText,
          debug: {
            host: HOST,
            timestamp,
            stringToSign,
            sampleBytes: audioBuffer.length,
          },
        },
        { status: 502 }
      );
    }

    // Your project may return music or humming depending on engine/config
    const match =
      payload?.metadata?.humming?.[0] ??
      payload?.metadata?.music?.[0] ??
      null;

    if (match) {
      return NextResponse.json({
        detected: true,
        title: match.title ?? null,
        artist:
          Array.isArray(match.artists) && match.artists.length > 0
            ? match.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
            : null,
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
        error: error?.message || "Unknown server error",
      },
      { status: 500 }
    );
  }
}
