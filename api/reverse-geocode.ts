export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: "Invalid lat/lon" }, null, 2), {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  }

  // Si querés, acá podrías llamar a tu Cloudflare worker y devolverlo tal cual:
  // (así tenés un "alias" en Vercel sin duplicar lógica)
  const workerUrl = `https://square-frost-5487.maurigimenaanahi.workers.dev/reverse-geocode?lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lon)}`;

  const res = await fetch(workerUrl);
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}
