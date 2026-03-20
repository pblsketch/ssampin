export default function ShortLinkNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <p className="text-lg text-gray-600 mb-2">링크를 찾을 수 없습니다</p>
        <p className="text-sm text-gray-400">만료되었거나 잘못된 링크입니다.</p>
        <a
          href="https://ssampin.com"
          className="inline-block mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          쌤핀 홈으로
        </a>
      </div>
    </div>
  );
}
