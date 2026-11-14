import type { Metadata, Viewport } from 'next';
import { Kanit, Noto_Sans_Thai, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FaithMap Studio — พันธกิจบ้านยุคใหม่ จ.กาฬสินธุ์',
  description:
    'FaithMap ระบบบริหารพันธกิจบ้าน ส่งรายงาน 3 ขั้นตอนไวใน 3 นาที แผนที่ 18 อำเภอกาฬสินธุ์ และสรุปประชุมอาทิตย์ 20:30 น.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#141413',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${kanit.variable} ${notoSansThai.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#F0F4F8] text-[#141413] antialiased">
        {children}
      </body>
    </html>
  );
}
