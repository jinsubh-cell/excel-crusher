/** @type {import('next').NextConfig} */
const nextConfig = {
  // CLAUDE_API_KEY는 서버 사이드 전용 env var
  // NEXT_PUBLIC_ 접두사가 없으므로 클라이언트 번들에 절대 포함되지 않음

  async headers() {
    return [
      {
        // Office Add-in 작업창 경로에만 적용
        source: '/excel-addin',
        headers: [
          // Excel(온라인/데스크탑)이 iframe으로 이 페이지를 로드할 수 있도록 허용
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://appsforoffice.microsoft.com https://ajax.aspnetcdn.com",
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' https://api.anthropic.com",
              "frame-ancestors https://*.office.com https://*.officeapps.live.com https://*.sharepoint.com https://excel.officeapps.live.com",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
            ].join('; '),
          },
          // X-Frame-Options는 frame-ancestors가 있으면 무시되지만 폴백으로 추가
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // manifest.xml CORS 설정
        source: '/manifest.xml',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Content-Type', value: 'application/xml' },
        ],
      },
    ]
  },
}

export default nextConfig
