import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NetWatch — Real-Time Network Monitor',
  description: 'Deep Packet Inspection dashboard powered by Spring Boot',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden antialiased">
        {children}
      </body>
    </html>
  )
}
