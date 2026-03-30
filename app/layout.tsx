import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '엑셀 깨부수기 — AI Excel Editor',
  description: 'Claude AI로 자연어 명령만으로 엑셀을 편집하세요',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  )
}
