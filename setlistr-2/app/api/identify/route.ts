// app/api/identify/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const ACRCLOUD_HOST = process.env.ACRCLOUD_HOST || "identify-us-west-2.acrcloud.com";
const ACRCLOUD_ACCESS_KEY = process.env.ACRCLOUD_ACCESS_KEY!;
const ACRCLOUD_ACCESS_SECRET = process.env.ACRCLOUD_ACCESS_SECRET!;

function signAcrcloud(params: {
  method: "POST";
  httpUri: "/v1/identify";
  accessKey: string;
  dataType: "audio";
  signatureVersion: "1";
  timestamp: string;
  accessSecret: string;
}) {
  const stringToSign = [
    params.method,
    params.httpUri,
    params.accessKey,
    params.dataType,
    params.signatureVersion,
    params.timestamp,
  ].join("\n");

  const signature = crypto
    .createHmac("sha1", params.accessSecret)
    .update(stringToSign, "utf8")
    .digest("base64");

  return { stringToSign, signature };
}

export async function POST(req: NextRequest) {
  try {
    if (!ACRCLOUD_ACCESS_KEY || !ACRCLOUD_ACCESS_SECRET) {
      return NextResponse.json(
        { error: "Missing ACRCloud environment variables" },
        { status: 500 }
      );
    }

    const incoming = await req.formData();
    const audioFile = incoming.get("audio");

    if (!(audioFile instanceof File)) {
      return NextResponse.json(
        { error: 'Expected FormData field "audio" as a File' },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const timestamp = Math.floor(Date.now() / 1000).toString();

    const { signature } = signAcrcloud({
      method: "POST",
      httpUri: "/v1/identify",
      accessKey: ACRCLOUD_ACCESS_KEY,
      dataType: "audio",
      signatureVersion: "1",
      timestamp,
      accessSecret: ACRCLOUD_ACCESS_SECRET,
    });

    const form = new FormData();
    form.append("access_key", ACRCLOUD_ACCESS_KEY);
    form.append("sample_bytes", String(audioBuffer.length));
    form.append(
      "sample",
      new Blob([audioBuffer], { type: audioFile.type || "application/octet-stream" }),
      audioFile.name || "sample.webm"
    );
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("data_type", "audio");
    form.append("signature_version", "1");

    const acrResponse = await fetch(`https://${ACRCLOUD_HOST}/v1/identify`, {
      method: "POST",
      body: form,
      // Do NOT set Content-Type manually — fetch sets the correct boundary automatically
    });

    const payload = await acrResponse.json();

    const humming = payload?.metadata?.humming;
    const music = payload?.metadata?.music;
    const match = (Array.isArray(humming) && humming[0]) || (Array.isArray(music) && music[0]);

    if (match?.title) {
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: Array.isArray(match.artists)
          ? match.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
          : "",
        isrc: match.external_ids?.isrc || "",
      });
    }

    return NextResponse.json({
      detected: false,
      debug: payload?.status ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
