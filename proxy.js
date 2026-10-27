import { NextResponse } from 'next/server'

// ALLOWED_IPS: 環境変数で管理する許可 IP リスト（カンマ区切り）。
// 例: "210.172.128.238,203.0.113.0/24"
// 単一IPのほか、IPv4のCIDR表記（例: 203.0.113.0/24）にも対応する。

function ipToInt(ip) {
const parts = ip.split('.')
if (parts.length !== 4) return null
let result = 0
for (const part of parts) {
if (!/^\d{1,3}$/.test(part)) return null
const n = Number(part)
if (n < 0 || n > 255) return null
result = (result << 8) | n
}
return result >>> 0
}

function parseAllowedIps(raw) {
return (raw || '')
.split(',')
.map((entry) => entry.trim())
.filter(Boolean)
}

function isIpAllowed(ip, allowedEntries) {
if (!ip) return false
const ipInt = ipToInt(ip)

for (const entry of allowedEntries) {
if (entry.includes('/')) {
const [rangeIp, bitsStr] = entry.split('/')
const bits = Number(bitsStr)
const rangeInt = ipToInt(rangeIp)
if (ipInt === null || rangeInt === null || Number.isNaN(bits) || bits < 0 || bits > 32) {
continue
}
const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
if ((ipInt & mask) === (rangeInt & mask)) return true
} else if (entry === ip) {
return true
}
}
return false
}

// Vercelが付与するヘッダーから接続元IPを取得する。
// x-forwarded-for は "クライアントIP, proxy1, proxy2" の順に並ぶため先頭を使う。
function getClientIp(request) {
const forwardedFor = request.headers.get('x-forwarded-for')
if (forwardedFor) {
const first = forwardedFor.split(',')[0].trim()
if (first) return first
}
const realIp = request.headers.get('x-real-ip')
if (realIp) return realIp.trim()
return null
}

export function proxy(request) {
// ローカル開発（next dev）では接続元IPの概念がないため制限をかけない。
// Vercel上（Preview/Production）では process.env.VERCEL === '1' になる。
if (process.env.VERCEL !== '1') {
return NextResponse.next()
}

    // 診断用: 自分の接続元IPアドレスを確認するための特別なパス。IP制限の対象外とする。
    if (request.nextUrl.pathname === '/ip-check') {
          const clientIp = getClientIp(request) || '(取得できませんでした)'
          return new NextResponse('あなたの接続元IPアドレス: ' + clientIp + '\n', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }

const allowedEntries = parseAllowedIps(process.env.ALLOWED_IPS)

// ALLOWED_IPS が未設定/空の場合は設定ミスとみなし、安全側に倒して全拒否する。
if (allowedEntries.length === 0) {
return new NextResponse('Forbidden (ALLOWED_IPS is not configured)', { status: 403 })
}

const clientIp = getClientIp(request)

if (isIpAllowed(clientIp, allowedEntries)) {
return NextResponse.next()
}

return new NextResponse('Forbidden', { status: 403 })
}

// 画面・API・静的ファイルを含むすべてのパスを対象にする。
export const config = {
matcher: '/:path*',
}
