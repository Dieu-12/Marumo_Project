import qrcode from 'qrcode-generator';

export function bookingQrSvgMarkup(bookingCode) {
  const qr = qrcode(0, 'M');
  qr.addData(bookingCode);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}

export default function BookingQrSvg({ bookingCode, size = 104, label }) {
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        lineHeight: 0,
        background: 'var(--color-white)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '6px',
      }}
      dangerouslySetInnerHTML={{ __html: bookingQrSvgMarkup(bookingCode) }}
    />
  );
}
