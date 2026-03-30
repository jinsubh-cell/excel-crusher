/** @type {import('next').NextConfig} */
const nextConfig = {
  // CLAUDE_API_KEY는 서버 사이드 전용 env var
  // NEXT_PUBLIC_ 접두사가 없으므로 클라이언트 번들에 절대 포함되지 않음
}

export default nextConfig
