import type { Metadata } from 'next';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/dm-sans/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aeriform — The seat experience',
  description: 'Explore the Aeriform wide-body cabin and choose a seat in an interactive simulated booking.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
