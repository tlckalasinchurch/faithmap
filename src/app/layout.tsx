import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FaithMap — ระบบจัดการและรายงานพันธกิจบ้าน',
  description:
    'FaithMap ระบบจัดการกลุ่มพันธกิจบ้าน สมาชิก รายงานประจำสัปดาห์ และสรุปประชุมผู้บริหาร (พื้นที่นำร่อง จังหวัดกาฬสินธุ์)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F766E',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased selection:bg-[#CCFBF1] selection:text-[#115E59]">
        {children}
      </body>
    </html>
  );
}
