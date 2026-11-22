import { ImageResponse } from 'next/og';

export const size = { width: 48, height: 48 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', borderRadius: 13, background: '#172728', color: '#fffefa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 29, fontWeight: 800 }}>A<span style={{ color: '#f28268' }}>.</span></div>,
    size,
  );
}
