/**
 * v2.1 신규 — 카드 이미지 다중 표시 gallery (Design v2.1 §5.15).
 *
 * - 1장: 단일 이미지 (max-h 240px)
 * - 2~3장: grid carousel (3장의 첫 이미지는 col-span-2)
 * - lazy load (loading="lazy")
 * - SVG는 도메인 + Zod 차단되므로 <img> 직접 렌더 안전 (HTML 실행 0)
 */

interface RealtimeWallCardImageGalleryProps {
  readonly images: readonly string[];
  /** 클릭 시 zoom 등 — Phase B에서는 단순 표시만 */
  readonly className?: string;
}

export function RealtimeWallCardImageGallery({
  images,
  className,
}: RealtimeWallCardImageGalleryProps) {
  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <img
        src={images[0]}
        alt="첨부 이미지"
        loading="lazy"
        className={[
          'rounded-lg max-h-[240px] w-auto object-contain bg-sp-bg mt-2',
          className,
        ].filter(Boolean).join(' ')}
      />
    );
  }

  return (
    <div className={['grid grid-cols-2 gap-2 mt-2', className].filter(Boolean).join(' ')}>
      {images.map((dataUrl, idx) => (
        <img
          key={idx}
          src={dataUrl}
          alt={`첨부 이미지 ${idx + 1}/${images.length}`}
          loading="lazy"
          className={[
            'rounded-lg object-cover bg-sp-bg w-full',
            images.length === 3 && idx === 0 ? 'col-span-2 max-h-[180px]' : 'max-h-[120px]',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
