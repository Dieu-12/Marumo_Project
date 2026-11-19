import { useState } from 'react';
import { Film } from 'lucide-react';
import './PosterImage.css';

export function PosterImage({ src, alt, size = 'sm' }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`poster-frame poster-frame--${size}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          className="poster-img"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="poster-fallback">
          <Film size={size === 'sm' ? 14 : 22} aria-hidden="true" />
          {size !== 'sm' ? <span className="poster-fallback-title">{alt}</span> : null}
        </div>
      )}
    </div>
  );
}
