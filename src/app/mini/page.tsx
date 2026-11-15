import type { Metadata, Viewport } from 'next';
import { MiniApp } from '@/components/mini/MiniApp';

export const metadata: Metadata = {
  title: 'FaithMap — แอปมือถือ',
  description: 'แอปส่งรายงานกลุ่มบ้านและดูแจ้งเตือนสำหรับมือถือ',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function MiniPage() {
  return <MiniApp />;
}
