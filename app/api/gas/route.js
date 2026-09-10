const GAS_URL = "https://script.google.com/a/macros/gmo-c.jp/s/AKfycbzVvegKTOYCmRbRL5S0jWaDyjysYzq6lZek17LxkRfjPAxlmIOqPalnikeWxXJSJhQhRw/exec";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'summary';
  const sheet = searchParams.get('sheet') || '';

  const url = `${GAS_URL}?type=${type}${sheet ? '&sheet=' + sheet : ''}`;

  const res = await fetch(url, { redirect: 'follow' });
  const data = await res.json();

  return Response.json(data);
}

export async function POST(request) {
  const body = await request.json();

  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const data = await res.json();

  return Response.json(data);
}
