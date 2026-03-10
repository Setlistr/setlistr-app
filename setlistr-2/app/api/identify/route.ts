// app/api/identify/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const HOST = (process.env.ACRCLOUD_HOST || "identify-us-west-2.acrcloud.com").trim();
const ACCESS_KEY = (process.env.ACRCLOUD_ACCESS_KEY || "").trim();
const ACCESS_SECRET = (process.env.ACRCLOUD_ACCESS_SECRET || "").trim();

function makeSignature({
  accessKey,
  accessSecret,
  timestamp,
}: {
  accessKey: string;
  accessSecret: string;
  timestamp: string;
}) {
  const stringToSign = [
    "POST",
    "/v1/identify",
    accessKey,
    "audio",
    "1",
    timestamp,
  ].join("\n");

  const signature = crypto
    .createHmac("sha1", accessSecret)
    .update(stringToSign, "utf8")
    .digest("base64");

  return { stringToSign, signature };
}

export async function POST(req: NextRequest) {
  try {
    if (!ACCESS_KEY || !ACCESS_SECRET || !HOST) {
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

    const bytes = Buffer.from(await audio.arrayBuffer());
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const { stringToSign, signature } = makeSignature({
      accessKey: ACCESS_KEY,
      accessSecret: ACCESS_SECRET,
      timestamp,
    });

    const form = new FormData();
    form.append("access_key", ACCESS_KEY);
    form.append("sample_bytes", String(bytes.length));
    form.append(
      "sample",
      new Blob([bytes], { type: audio.type || "application/octet-stream" }),
      audio.name || "sample.webm"
    );
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("data_type", "audio");
    form.append("signature_version", "1");

    const acrRes = await fetch(`https://${HOST}/v1/identify`, {
      method: "POST",
      body: form,
    });

    const raw = await acrRes.text();

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          detected: false,
          error: "ACRCloud returned non-JSON",
          debug: {
            stringToSign,
            postedFields: {
              access_key: ACCESS_KEY,
              sample_bytes: String(bytes.length),
              timestamp,
              data_type: "audio",
              signature_version: "1",
              signature,
              host: HOST,
              endpoint: "/v1/identify",
            },
            raw,
          },
        },
        { status: 502 }
      );
    }

    const humming = json?.metadata?.humming;
    if (Array.isArray(humming) && humming.length > 0) {
      const first = humming[0];
      const title = first?.title ?? null;
      const artist =
        Array.isArray(first?.artists) && first.artists.length
          ? first.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
          : null;

      if (title) {
        return NextResponse.json({ detected: true, title, artist });
      }
    }

    return NextResponse.json({
      detected: false,
      debug: json?.status ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        detected: false,
        error: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
